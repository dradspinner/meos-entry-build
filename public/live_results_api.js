// Configuration
// Silence console noise for production display
(function(){ try { var noop=function(){}; console.log=noop; console.info=noop; console.warn=noop; console.error=noop; } catch(e) {} })();
const MEOS_API_BASE = 'http://localhost:2009';
let REFRESH_INTERVAL = 15000; // 15 seconds (default, user can change)
let refreshIntervalId = null;

let lastUpdateTime = null;
let currentResults = [];
let apiStatus = 'unknown';
let isRefreshing = false;
let finishTimestamps = {}; // Track when runners first appeared with finish times
let classMap = {}; // ID -> Name mapping
let courseLengths = {}; // Class name -> course length

// Refresh coordination
let userRefreshMs = REFRESH_INTERVAL;      // user-selected
let cycleMinMs = 0;                        // min cycle time reported by screens
let effectiveRefreshMs = Math.max(userRefreshMs, cycleMinMs);
let lastFetchTs = 0;

// Rapid reoptimization when data changes
let lastFingerprint = '';
let quickTimer = null;
let quickUntil = 0;

// Configuration state
let screenCount = 1;
let maxColumns = 6; // User-configurable maximum columns

// XML Parsing Helper
function parseXmlResponse(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
        throw new Error(`XML parse error: ${parseError.textContent}`);
    }
    
    return xmlToObject(xmlDoc.documentElement);
}

function xmlToObject(node) {
    const result = {};
    
    // Handle attributes
    if (node.attributes.length > 0) {
        result['@attributes'] = {};
        for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes[i];
            result['@attributes'][attr.name] = attr.value;
        }
    }
    
    // Handle child nodes
    if (node.childNodes.length > 0) {
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent?.trim();
                if (text) {
                    result['#text'] = text;
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const childElement = child;
                const childObject = xmlToObject(childElement);
                
                if (result[childElement.nodeName]) {
                    if (!Array.isArray(result[childElement.nodeName])) {
                        result[childElement.nodeName] = [result[childElement.nodeName]];
                    }
                    result[childElement.nodeName].push(childObject);
                } else {
                    result[childElement.nodeName] = childObject;
                }
            }
        }
    }
    
    return result;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Accept cycle messages from result windows to align refresh timing
    window.addEventListener('message', (ev) => {
        const data = ev.data || {};
        if (data.type === 'lr_cycle') {
            const newCycle = Math.max(0, parseInt(data.cycleMs || 0));
            if (!isNaN(newCycle)) {
                if (newCycle > cycleMinMs) {
                    cycleMinMs = newCycle;
                    // Don't restart refresh - let it sync naturally
                }
            }
            // Trigger refresh at cycle boundary if enough time has passed
            const minRefreshGap = Math.max(effectiveRefreshMs, newCycle, 30000); // At least 30s between refreshes
            if (Date.now() - lastFetchTs >= minRefreshGap) {
                console.log('[Refresh] Cycle boundary - refreshing data (last refresh was ' + Math.round((Date.now() - lastFetchTs)/1000) + 's ago)');
                fetchResults().catch(()=>{});
            } else {
                console.log('[Refresh] Cycle boundary - skipping refresh (last refresh was only ' + Math.round((Date.now() - lastFetchTs)/1000) + 's ago)');
            }
        }
    });
    loadEventMeta();
    loadConfiguration();
    setupEventListeners();
    initializeApiData();
    startAutoRefresh();
});

async function initializeApiData() {
    try {
        // Load competition info
        const comp = await fetchCompetition();
        if (comp) {
            document.getElementById('eventTitle').textContent = `Live Results - ${comp.name}`;
            document.getElementById('eventDate').textContent = comp.date;
        }

        // Load class map and course lengths in one call
        const classData = await fetchAllClassesWithCourses();
        classMap = classData.classMap;
        courseLengths = classData.courseLengths;

        console.log('✅ API initialized - class map and course lengths loaded');

        // Fetch first results
        await fetchResults();
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        apiStatus = 'offline';
        updateStatusDisplay();
    }
}

function startAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }
    // Only use timer-based refresh if there's no scrolling (cycleMinMs will be 0)
    // When scrolling is active, cycle messages handle refreshes
    if (cycleMinMs === 0) {
        console.log('[Refresh] Starting timer-based refresh (no scroll active)');
        refreshIntervalId = setInterval(async () => {
            if (apiStatus === 'online') {
                if (Date.now() - lastFetchTs >= effectiveRefreshMs - 50) {
                    console.log('[Refresh] Timer-based refresh triggered');
                    await fetchResults();
                }
            }
        }, Math.max(1000, effectiveRefreshMs));
    } else {
        console.log('[Refresh] Scroll active - using cycle-based refresh instead of timer');
    }
}

function scheduleQuickBurst(seconds = 15) {
    quickUntil = Date.now() + seconds * 1000;
    if (!quickTimer) {
        quickTimer = setTimeout(quickTick, 2000);
    }
}

async function quickTick() {
    quickTimer = null;
    if (Date.now() >= quickUntil) return;
    if (!isRefreshing && apiStatus === 'online' && (Date.now() - lastFetchTs >= effectiveRefreshMs - 50)) {
        try { await fetchResults(); } catch {}
    }
    quickTimer = setTimeout(quickTick, 2000);
}

function fingerprint(results) {
    try {
        if (!Array.isArray(results)) return '';
        return results.map(c => `${c.className}:${c.runners?.length || 0}`).join('|');
    } catch { return ''; }
}

function loadConfiguration() {
    const savedConfig = localStorage.getItem('liveResults_config');
    if (savedConfig) {
        const config = JSON.parse(savedConfig);
        screenCount = config.screenCount || 1;
        maxColumns = config.maxColumns || 6;
        document.getElementById('screenCount').value = screenCount;
        if (document.getElementById('maxColumns')) {
            document.getElementById('maxColumns').value = maxColumns;
        }

        if (config.refreshInterval) {
            REFRESH_INTERVAL = config.refreshInterval * 1000;
            document.getElementById('refreshInterval').value = config.refreshInterval;
        }
    }
}

function saveConfiguration() {
    const config = {
        screenCount,
        maxColumns,
        refreshInterval: REFRESH_INTERVAL / 1000
    };
    localStorage.setItem('liveResults_config', JSON.stringify(config));
}

function setupEventListeners() {
    document.getElementById('screenCount').addEventListener('change', (e) => {
        screenCount = parseInt(e.target.value);
        saveConfiguration();
        if (currentResults.length > 0) displayResults(currentResults);
    });

    document.getElementById('refreshInterval').addEventListener('change', (e) => {
        REFRESH_INTERVAL = parseInt(e.target.value) * 1000;
        userRefreshMs = REFRESH_INTERVAL;
        saveConfiguration();
        startAutoRefresh();
    });

    if (document.getElementById('maxColumns')) {
        document.getElementById('maxColumns').addEventListener('change', (e) => {
            maxColumns = parseInt(e.target.value);
            saveConfiguration();
            if (currentResults.length > 0) displayResults(currentResults);
        });
    }
}

function loadEventMeta() {
    try {
        const meta = localStorage.getItem('meos_event_meta');
        if (meta) {
            const eventData = JSON.parse(meta);
            document.getElementById('eventTitle').textContent =
                `Live Results - ${eventData.name || 'DVOA Event'}`;
            document.getElementById('eventDate').textContent =
                eventData.date || new Date().toISOString().split('T')[0];
        }
    } catch (e) {
        console.error('Failed to load event metadata:', e);
    }
}

// ========== API CALLS ==========

async function fetchCompetition() {
    try {
        const response = await fetch(`${MEOS_API_BASE}/meos?get=competition`, {
            method: 'GET',
            headers: { 'Accept': 'application/xml' },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) throw new Error(`API returned status ${response.status}`);

        const xmlText = await response.text();
        const data = parseXmlResponse(xmlText);
        
        // Extract competition data
        const comp = data.MOPComplete?.Competition;
        if (comp) {
            return {
                name: comp.Name || '',
                date: comp.Date || ''
            };
        }
        return null;
    } catch (error) {
        console.error('Failed to fetch competition:', error);
        return null;
    }
}

async function fetchAllClassesWithCourses() {
    try {
        console.log('📋 Fetching classes with courses from entryclass API...');
        const response = await fetch(`${MEOS_API_BASE}/meos?get=entryclass`, {
            method: 'GET',
            headers: { 'Accept': 'application/xml' },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) throw new Error(`API returned status ${response.status}`);

        const xmlText = await response.text();
        console.log(`📜 Entryclass XML received (${xmlText.length} chars)`);
        console.log(`📜 First 500 chars: ${xmlText.substring(0, 500)}`);
        
        const data = parseXmlResponse(xmlText);
        console.log('📋 Parsed entryclass data - root keys:', Object.keys(data));
        
        // Extract classes - entryclass returns 'Class' array
        const classList = data.Class;
        if (!classList) {
            console.log('⚠️ No Class array found in response');
            console.log('Available root keys:', Object.keys(data));
            return { classMap: {}, courseLengths: {} };
        }
        
        const classes = Array.isArray(classList) ? classList : [classList];
        console.log(`📊 Found ${classes.length} classes`);
        
        const classMap = {};
        const courseLengths = {};
        
        classes.forEach(cls => {
            const id = cls['@attributes']?.id || '';
            const name = cls.Name?.['#text'] || cls.Name || '';
            const courseLength = parseInt(cls.Length?.['#text'] || cls.Length || '0');
            
            if (id && name) {
                classMap[id] = name;
            }
            
            if (name && courseLength > 0) {
                courseLengths[name] = courseLength;
            }
            
            console.log(`  Class: id=${id}, name=${name}, courseLength=${courseLength}m`);
        });
        
        console.log('✅ Class map:', classMap);
        console.log('✅ Course lengths:', courseLengths);
        
        return { classMap, courseLengths };
    } catch (error) {
        console.error('Failed to fetch classes:', error);
        return { classMap: {}, courseLengths: {} };
    }
}


async function fetchResults() {
    if (isRefreshing) return;

    isRefreshing = true;

    try {
        console.log('🔄 Fetching results from MeOS API...');

        // Fetch finished results
        const response = await fetch(`${MEOS_API_BASE}/meos?get=result&preliminary=true`, {
            method: 'GET',
            headers: { 'Accept': 'application/xml' },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) throw new Error(`API returned status ${response.status}`);

        const xmlText = await response.text();
        const data = parseXmlResponse(xmlText);
        
        // Fetch all competitors to get checked-in runners
        const competitors = await fetchAllCompetitors();
        
        // The root element is 'results' with 'person' array inside
        // If no finished results yet, we'll only show checked-in runners
        if (!data.results || !data.results.person) {
            console.log('⚠️ No finished results yet, showing only checked-in runners');
            
            // Create empty results structure that will be filled with checked-in runners
            data.results = { person: [] };
        }

        // Parse results and merge with checked-in runners
        const classResults = await parseResultsWithAnalysis(data, competitors);

        // Track finish timestamps
        const now = Date.now();
        classResults.forEach(classResult => {
            classResult.runners.forEach(runner => {
                const runnerKey = `${classResult.className}:${runner.fullName}`;
                if (runner.totalTime && !finishTimestamps[runnerKey]) {
                    finishTimestamps[runnerKey] = now;
                    runner.finishedAt = now;
                } else if (finishTimestamps[runnerKey]) {
                    runner.finishedAt = finishTimestamps[runnerKey];
                }
            });
        });

        // Detect data change to trigger rapid reoptimization bursts
        const fp = fingerprint(classResults);
        if (fp !== lastFingerprint) {
            lastFingerprint = fp;
            scheduleQuickBurst(20); // temporarily poll faster for ~20s while activity is high
        }

        currentResults = classResults;
        displayResults(classResults);
        updateLastUpdateTime();
        lastFetchTs = Date.now();

        apiStatus = 'online';
        updateStatusDisplay();

    } catch (error) {
        console.error('❌ Failed to fetch results:', error);
        apiStatus = 'offline';
        updateStatusDisplay();
    } finally {
        isRefreshing = false;
    }
}

async function fetchAllCompetitors() {
    try {
        console.log('👥 Fetching all competitors (including checked-in)...');
        
        const response = await fetch(`${MEOS_API_BASE}/meos?get=competitor`, {
            method: 'GET',
            headers: { 'Accept': 'application/xml' },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.log(`❌ Response not OK: ${response.status}`);
            return [];
        }

        const xmlText = await response.text();
        console.log(`📜 Received XML response (${xmlText.length} chars)`);
        
        const data = parseXmlResponse(xmlText);
        console.log('📋 Parsed data:', data);
        
        // Parse competitors - cmp is at root level, not under MOPComplete
        const cmpList = data.cmp;
        if (!cmpList) {
            console.log('❌ No cmp list found in response');
            return [];
        }
        
        const competitors = Array.isArray(cmpList) ? cmpList : [cmpList];
        console.log(`✅ Fetched ${competitors.length} total competitors`);
        
        return competitors;
    } catch (error) {
        console.error('❌ Failed to fetch competitors:', error);
        return [];
    }
}

async function parseResultsWithAnalysis(resultsData, competitors = []) {
    const results = resultsData.results;
    const persons = Array.isArray(results.person) ? results.person : (results.person ? [results.person] : []);

    const byClass = {};

    for (const person of persons) {
        const competitorId = person.name?.['@attributes']?.id;
        const classId = person['@attributes']?.cls;
        const className = getClassName(classId);
        
        console.log(`Processing runner - classId: ${classId}, className: ${className}, courseLengths[${className}]: ${courseLengths[className]}`);

        if (!byClass[className]) {
            const courseLength = courseLengths[className] || 5000;
            console.log(`  Creating new class entry: ${className}, courseLength: ${courseLength}`);
            byClass[className] = {
                className,
                courseLength,
                runners: []
            };
        }

        const name = person.name?.['#text'] || person.name || '';
        const club = person.org?.['#text'] || person.org || '';
        const place = parseInt(person['@attributes']?.place || '0');
        const rtValue = parseInt(person['@attributes']?.rt || '0');
        const timeMs = (rtValue / 10) * 100; // rt is in deciseconds × 10
        const status = parseInt(person['@attributes']?.stat || '0');

        const runner = {
            competitorId,
            fullName: name,
            club,
            position: place,
            totalTime: timeMs,
            timeBehindLeader: null,
            timeLost: null,
            status: status === 1 ? 'finished' : 'dnf'
        };

        byClass[className].runners.push(runner);
    }

    // Sort each class by place
    for (const className in byClass) {
        byClass[className].runners.sort((a, b) => a.position - b.position);
    }

    // Fetch split analysis for finished runners
    await enrichWithSplitAnalysis(byClass);

    // Calculate time behind leader
    for (const className in byClass) {
        const classResult = byClass[className];
        const leader = classResult.runners.find(r => r.position === 1);
        const leaderTime = leader?.totalTime;

        if (leaderTime) {
            classResult.runners.forEach(runner => {
                if (runner.totalTime && runner.totalTime > leaderTime) {
                    runner.timeBehindLeader = runner.totalTime - leaderTime;
                }
            });
        }
    }

    // Add checked-in runners who haven't finished
    if (competitors.length > 0) {
        console.log(`🔍 Merging checked-in runners from ${competitors.length} total competitors...`);
        
        // Build set of runners already in results
        const finishedRunnerIds = new Set();
        for (const className in byClass) {
            byClass[className].runners.forEach(r => {
                if (r.competitorId) finishedRunnerIds.add(r.competitorId);
            });
        }
        console.log(`  - ${finishedRunnerIds.size} runners already have results`);
        
        // Add checked-in runners not yet in results
        let checkedInCount = 0;
        let skippedFinished = 0;
        let skippedStatus = 0;
        
        competitors.forEach(cmp => {
            const compId = cmp['@attributes']?.id;
            const base = cmp.base;
            
            if (!base || !compId) {
                console.log('  - Skipping competitor with no base or ID');
                return;
            }
            
            // Skip if already in results
            if (finishedRunnerIds.has(compId)) {
                skippedFinished++;
                return;
            }
            
            const classId = base['@attributes']?.cls;
            const className = getClassName(classId);
            const stat = parseInt(base['@attributes']?.stat || '0');
            const stValue = parseInt(base['@attributes']?.st || '0'); // Start time in 1/10 seconds since midnight
            const name = base['#text'] || '';
            const org = base['@attributes']?.org;
            
            // Competitor processing for running time calculation
            
            // Only include if status is 0 (unknown/checked-in) or 2 (no timing)
            if (stat !== 0 && stat !== 2) {
                skippedStatus++;
                return;
            }
            
            if (!byClass[className]) {
                byClass[className] = {
                    className,
                    courseLength: courseLengths[className] || 5000,
                    runners: []
                };
            }
            
            // Determine status: running if they have a start time, otherwise checked-in
            const runnerStatus = stValue > 0 ? 'running' : 'checked_in';
            
            // Calculate running time if started
            let runningTime = null;
            if (stValue > 0) {
                // stValue is in 1/10 seconds since midnight
                const secondsSinceMidnight = stValue / 10;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const startTime = today.getTime() + (secondsSinceMidnight * 1000);
                const now = Date.now();
                runningTime = now - startTime; // milliseconds
            }
            
            // Add runner
            byClass[className].runners.push({
                competitorId: compId,
                fullName: name,
                club: '', // We'd need to lookup org ID to get club name
                position: null,
                totalTime: runningTime, // Use running time as totalTime for display
                timeBehindLeader: null,
                timeLost: null,
                status: runnerStatus
            });
            
            checkedInCount++;
        });
        
        console.log(`✅ Merge complete:`);
        console.log(`  - Added: ${checkedInCount} checked-in runners`);
        console.log(`  - Skipped (already finished): ${skippedFinished}`);
        console.log(`  - Skipped (wrong status): ${skippedStatus}`);
    }

    // Convert to array and sort by class name
    const classResults = Object.values(byClass);
    classResults.sort((a, b) => compareClassNames(a.className, b.className));

    return classResults;
}

async function enrichWithSplitAnalysis(resultsByClass, limitPerClass = 20, concurrency = 6) {
    // Concurrency-limited queue executor
    async function runLimited(tasks, limit) {
        const results = new Array(tasks.length);
        let next = 0;
        const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
            while (next < tasks.length) {
                const cur = next++;
                try {
                    results[cur] = await tasks[cur]();
                } catch (e) {
                    results[cur] = null;
                }
            }
        });
        await Promise.all(workers);
        return results;
    }

    for (const className in resultsByClass) {
        const classResult = resultsByClass[className];
        const finishedRunners = classResult.runners
            .filter(r => r.status === 'finished')
            .sort((a,b) => (a.position||9999) - (b.position||9999))
            .slice(0, limitPerClass); // limit per class for performance

        const tasks = finishedRunners.map(runner => async () => {
            if (!runner.competitorId) return null;
            const details = await lookupCompetitor(parseInt(runner.competitorId));
            if (details && details.splits) {
                runner.timeLost = calculateTotalTimeLost(details.splits);
            }
            return null;
        });
        await runLimited(tasks, concurrency);
    }
}

async function lookupCompetitor(competitorId) {
    try {
        const response = await fetch(`${MEOS_API_BASE}/meos?lookup=competitor&id=${competitorId}`, {
            method: 'GET',
            headers: { 'Accept': 'application/xml' },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return null;

        const xmlText = await response.text();
        const data = parseXmlResponse(xmlText);
        
        // Parse competitor with splits
        const competitor = data.Competitors?.Competitor || data.Competitor;
        if (!competitor) return null;
        
        // Extract splits for analysis - MeOS API uses Splits.Control structure
        const splitList = competitor.Splits?.Control;
        const splits = splitList ? (Array.isArray(splitList) ? splitList : [splitList]) : [];
        
        console.log(`  📊 Found ${splits.length} splits for competitor`);
        
        return {
            splits: splits.map((split, idx) => {
                const analysis = split.Analysis;
                const result = {
                    analysis: analysis ? {
                        // IMPORTANT: Use 'mistake' not 'lost' for actual lost time
                        // 'lost' = time behind leg leader
                        // 'mistake' = calculated lost/missed time from MeOS algorithm
                        lost: analysis['@attributes']?.lost || '',
                        behind: analysis['@attributes']?.behind || '',
                        mistake: analysis['@attributes']?.mistake || ''
                    } : null
                };
                
                if (analysis && analysis['@attributes']?.mistake) {
                    console.log(`    Split ${idx + 1}: mistake="${analysis['@attributes'].mistake}"`);
                }
                
                return result;
            })
        };
    } catch (error) {
        console.warn(`Failed to lookup competitor ${competitorId}:`, error);
        return null;
    }
}

/**
 * Calculate total lost time from split analysis
 * 
 * IMPORTANT: Uses 'mistake' attribute, not 'lost':
 * - 'lost' = time behind leg leader (NOT total lost time)
 * - 'mistake' = actual calculated lost/missed time from MeOS algorithm
 * 
 * Only sums POSITIVE mistake values (matching MeOS getMissedTime() logic)
 */
function calculateTotalTimeLost(splits) {
    if (!splits || splits.length === 0) {
        console.log('    ⚠️ No splits provided to calculateTotalTimeLost');
        return 0;
    }

    let totalLost = 0;
    let mistakesFound = 0;
    
    for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        if (split.analysis && split.analysis.mistake) {
            const lostMs = parseTimeString(split.analysis.mistake);
            console.log(`    📌 Split ${i + 1}: mistake="${split.analysis.mistake}" = ${lostMs}ms`);
            // Only sum positive values (as per MeOS getMissedTime logic)
            if (lostMs > 0) {
                totalLost += lostMs;
                mistakesFound++;
            }
        }
    }
    
    console.log(`    ✅ Calculated ${mistakesFound} mistakes totaling ${totalLost}ms (${formatTime(totalLost)})`);
    return totalLost;
}

function parseTimeString(timeStr) {
    if (!timeStr || timeStr === '') return 0;

    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseFloat(parts[1]) || 0;
        return (minutes * 60 + seconds) * 1000;
    }

    return 0;
}

function getClassName(classId) {
    return classMap[classId] || `Class ${classId}`;
}

function compareClassNames(a, b) {
    const order = ['White', 'Yellow', 'Orange', 'Brown', 'Green', 'Red', 'Blue'];
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);

    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
}

// ========== DISPLAY FUNCTIONS ==========

// Store opened screen windows for updates
let screenWindows = [];

function displayResults(classResults) {
        console.log('Displaying results:', classResults);
        const container = document.getElementById('resultsContainer');

    if (!classResults || classResults.length === 0) {
        container.innerHTML = `
            <div class="class-card">
                <div class="no-results">
                    <div class="no-results-icon">⌛</div>
                    <h3>Waiting for Results</h3>
                    <p>Results will appear here as runners finish.</p>
                </div>
            </div>
        `;
        return;
    }

    console.log(`🚀 Generating display for ${classResults.length} classes...`);
    generateScreenFiles(classResults, screenCount);
    container.innerHTML = generateScreenLinks(screenCount);
}

function generateScreenFiles(classResults, numScreens) {
    console.log('📺 [generateScreenFiles] Called with:', classResults.length, 'classes,', numScreens, 'screens');
    
    // Optimize class distribution across ALL screens
    const optimizedScreenSections = optimizeGlobalDistribution(classResults, numScreens);
    console.log('📺 [generateScreenFiles] Optimized sections:', optimizedScreenSections.length);
    
    // Close any existing screen windows beyond our new count
    for (let i = numScreens; i < screenWindows.length; i++) {
        if (screenWindows[i] && !screenWindows[i].closed) {
            screenWindows[i].close();
        }
    }
    screenWindows = screenWindows.slice(0, numScreens);
    
    optimizedScreenSections.forEach((section, screenIndex) => {
        const screenNumber = screenIndex + 1;
        const lastY = (screenWindows[screenIndex] && !screenWindows[screenIndex].closed && typeof screenWindows[screenIndex].__lastScrollY === 'number')
          ? screenWindows[screenIndex].__lastScrollY : 0;
        const html = generateScreenHTML(section, screenNumber, numScreens, lastY);
        
        // Check if window exists and is still open
        if (screenWindows[screenIndex] && !screenWindows[screenIndex].closed) {
            // Update existing window content
            console.log(`🔄 Updating screen ${screenNumber} content`);
            try {
                screenWindows[screenIndex].document.open();
                screenWindows[screenIndex].document.write(html);
                screenWindows[screenIndex].document.close();
                console.log(`✅ Screen ${screenNumber} updated successfully`);
            } catch (error) {
                console.error(`❌ Error updating screen ${screenNumber}:`, error);
                screenWindows[screenIndex] = null;
            }
        }
        
        // Open new window if needed
        if (!screenWindows[screenIndex] || screenWindows[screenIndex].closed) {
            try {
                console.log(`🎆 Opening screen ${screenNumber} with fresh content`);
                screenWindows[screenIndex] = window.open('', `screen_${screenNumber}`, 'width=1200,height=800');
                if (screenWindows[screenIndex]) {
                    screenWindows[screenIndex].document.open();
                    screenWindows[screenIndex].document.write(html);
                    screenWindows[screenIndex].document.close();
                    console.log(`✅ Screen ${screenNumber} opened successfully`);
                } else {
                    console.error(`❌ Failed to open screen ${screenNumber} - popup blocked?`);
                }
            } catch (error) {
                console.error(`❌ Error opening screen ${screenNumber}:`, error);
            }
        }
    });
}

function optimizeGlobalDistribution(classResults, numScreens) {
    if (numScreens === 1) {
        return [classResults];
    }
    
    const totalRunners = classResults.reduce((sum, c) => sum + c.runners.length, 0);
    const availableHeight = (window.innerHeight || 1080) - 50;
    
    console.log(`Optimizing ${totalRunners} runners, ${classResults.length} classes across ${numScreens} screens`);
    
    let bestGlobalDistribution = null;
    let bestGlobalFontSize = 0;
    
    // Try different distribution strategies
    const strategies = [
        'balanced_runners',
        'balanced_classes',
        'minimize_max_load',
        'optimize_per_screen'
    ];
    
    for (const strategy of strategies) {
        const distribution = distributeByStrategy(classResults, numScreens, strategy);
        
        // Calculate minimum font size across all screens
        let minFontSize = Infinity;
        
        distribution.forEach((screenClasses) => {
            if (screenClasses.length === 0) {
                minFontSize = 0;
                return;
            }
            
            const layout = findOptimalLayoutForScreen(screenClasses, availableHeight);
            const fontSize = layout.fontSizes.tableCell;
            
            minFontSize = Math.min(minFontSize, fontSize);
        });
        
        // Keep best distribution
        if (minFontSize > bestGlobalFontSize) {
            bestGlobalFontSize = minFontSize;
            bestGlobalDistribution = distribution;
            console.log(`Strategy '${strategy}': ${minFontSize}px font (NEW BEST)`);
        } else {
            console.log(`Strategy '${strategy}': ${minFontSize}px font`);
        }
    }
    
    console.log(`Final choice: ${bestGlobalFontSize}px minimum font size across all screens`);
    return bestGlobalDistribution || [classResults];
}

function distributeByStrategy(classResults, numScreens, strategy) {
    const screens = Array(numScreens).fill(null).map(() => []);
    
    switch (strategy) {
        case 'balanced_runners': {
            const totalRunners = classResults.reduce((sum, c) => sum + c.runners.length, 0);
            const targetPerScreen = totalRunners / numScreens;
            const screenRunnerCounts = Array(numScreens).fill(0);
            
            let currentScreen = 0;
            
            classResults.forEach(classResult => {
                if (screenRunnerCounts[currentScreen] + classResult.runners.length > targetPerScreen * 1.2 &&
                    currentScreen < numScreens - 1) {
                    currentScreen++;
                }
                
                screens[currentScreen].push(classResult);
                screenRunnerCounts[currentScreen] += classResult.runners.length;
            });
            break;
        }
        
        case 'balanced_classes': {
            classResults.forEach((classResult, index) => {
                screens[index % numScreens].push(classResult);
            });
            break;
        }
        
        case 'minimize_max_load': {
            const screenRunnerCounts = Array(numScreens).fill(0);
            
            classResults.forEach(classResult => {
                const minIndex = screenRunnerCounts.indexOf(Math.min(...screenRunnerCounts));
                screens[minIndex].push(classResult);
                screenRunnerCounts[minIndex] += classResult.runners.length;
            });
            break;
        }
        
        case 'optimize_per_screen': {
            const classesPerScreen = Math.ceil(classResults.length / numScreens);
            
            classResults.forEach((classResult, index) => {
                const screenIndex = Math.floor(index / classesPerScreen);
                if (screenIndex < numScreens) {
                    screens[screenIndex].push(classResult);
                } else {
                    screens[numScreens - 1].push(classResult);
                }
            });
            break;
        }
    }
    
    return screens.filter(screen => screen.length > 0);
}

function findOptimalLayoutForScreen(classResults, availableHeight) {
    const availableWidth = (window.innerWidth || 1920) - 20;
    const minColumnWidth = 320;
    
    // Use user's max columns setting directly
    const maxColumnsByWidth = Math.floor(availableWidth / minColumnWidth);
    const maxColumnsByClasses = classResults.length;
    const maxColumnsLimit = Math.min(maxColumns, maxColumnsByWidth, maxColumnsByClasses);
    
    console.log(`Using ${maxColumnsLimit} columns (user max: ${maxColumns}, width allows: ${maxColumnsByWidth})`);
    
    // Fixed font sizes for predictable display
    const fontSizes = {
        classTitle: 17,
        runnerName: 17,
        tableHeader: 13,
        tableCell: 15,
        position: 15,
        padding: 3,
        headerPadding: 3,
        cardMargin: 2
    };
    
    const columnSections = distributeToColumns(classResults, maxColumnsLimit);
    
    return { 
        optimalColumns: maxColumnsLimit, 
        columnSections, 
        fontSizes 
    };
}

function distributeToColumns(classResults, numColumns) {
    // Preserve visual reading order: fill down each column, then move to next column
    const columns = Array(numColumns).fill(null).map(() => []);
    const classesPerColumn = Math.ceil(classResults.length / numColumns);
    classResults.forEach((classResult, index) => {
        const columnIndex = Math.floor(index / classesPerColumn);
        if (columnIndex < numColumns) {
            columns[columnIndex].push(classResult);
        } else {
            columns[numColumns - 1].push(classResult);
        }
    });
    return columns;
}

function calculateFontSizesForLayout(columnSections, availableHeight) {
    const maxContentInColumn = Math.max(...columnSections.map(column => {
        return column.reduce((sum, classResult) => {
            return sum + 2 + classResult.runners.length; // header + table header + runners
        }, 0);
    }));
    
    const theoreticalMaxRowHeight = Math.floor(availableHeight / maxContentInColumn);
    let bestFontSize = null;
    const maxTestScale = Math.min(2.0, theoreticalMaxRowHeight / 10);
    
    // Test scale factors from high to low to find largest font that fits
    for (let scale = maxTestScale; scale >= 0.1; scale -= 0.05) {
        const fontSize = {
            classTitle: Math.max(5, Math.floor(9 * scale)),
            runnerName: Math.max(5, Math.floor(10 * scale)),
            tableHeader: Math.max(5, Math.floor(7 * scale)),
            tableCell: Math.max(5, Math.floor(7 * scale)),
            position: Math.max(5, Math.floor(9 * scale)),
            padding: Math.max(1, Math.floor(2 * scale)),
            headerPadding: Math.max(1, Math.floor(2 * scale)),
            cardMargin: Math.max(0, Math.floor(1 * scale))
        };
        
        // Calculate actual height needed for this font size
        const estimatedHeight = columnSections.reduce((maxHeight, column) => {
            const columnHeight = column.reduce((sum, classResult) => {
                const headerHeight = Math.ceil((fontSize.classTitle * 1.4) + (fontSize.headerPadding * 2) + 4);
                const tableHeaderHeight = Math.ceil((fontSize.tableHeader * 1.4) + (fontSize.padding * 2) + 2);
                const runnerRowsHeight = classResult.runners.length * Math.ceil(fontSize.tableCell * 1.5 + (fontSize.padding * 2) + 2);
                const spacing = fontSize.cardMargin + 5;
                return sum + headerHeight + tableHeaderHeight + runnerRowsHeight + spacing;
            }, 0);
            return Math.max(maxHeight, columnHeight);
        }, 0);
        
        // Add 20% safety margin to prevent clipping
        if (estimatedHeight * 1.2 <= availableHeight) {
            if (!bestFontSize || fontSize.tableCell > bestFontSize.tableCell) {
                bestFontSize = fontSize;
            }
        }
    }
    
    if (!bestFontSize) {
        bestFontSize = {
            classTitle: 5, runnerName: 5, tableHeader: 5, tableCell: 5,
            position: 5, padding: 1, headerPadding: 1, cardMargin: 0
        };
    }
    
    return bestFontSize;
}

function generateScreenHTML(classResults, screenNumber, totalScreens, initialScrollY = 0) {
    const { optimalColumns, columnSections, fontSizes } = findOptimalLayoutForScreen(classResults, (window.innerHeight || 1080) - 50);

    // Readability thresholds for outdoor viewing (optimized for spacing)
    const READABILITY = { tableCell: 15, runnerName: 17, tableHeader: 13, classTitle: 17, position: 15, padding: 3, headerPadding: 3 };
    const needsScroll = fontSizes.tableCell < READABILITY.tableCell;
    const applied = { ...fontSizes };
    if (needsScroll) {
        applied.tableCell = Math.max(applied.tableCell, READABILITY.tableCell);
        applied.runnerName = Math.max(applied.runnerName, READABILITY.runnerName);
        applied.tableHeader = Math.max(applied.tableHeader, READABILITY.tableHeader);
        applied.classTitle = Math.max(applied.classTitle, READABILITY.classTitle);
        applied.position = Math.max(applied.position, READABILITY.position);
        applied.padding = Math.max(applied.padding, READABILITY.padding);
        applied.headerPadding = Math.max(applied.headerPadding, READABILITY.headerPadding);
    }
    
    // ---------- Column segmentation to avoid scrolling ----------
    const availableHeight = ((typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080) - 44;
    const availableWidth = ((typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920) - 20;
    const minColumnWidth = 280;
    const maxColumnsByWidth = Math.min(12, Math.floor(availableWidth / minColumnWidth));
    const maxColumnsAllowed = Math.min(maxColumns, maxColumnsByWidth); // Respect user's max columns setting

    const headerH = Math.ceil(applied.classTitle * 1.4 + applied.headerPadding * 2 + 4);
    const tableHeaderH = Math.ceil(applied.tableHeader * 1.4 + applied.padding * 2 + 2);
    const rowH = Math.ceil(applied.tableCell * 1.5 + applied.padding * 2 + 2);
    const cardSpacing = applied.cardMargin + 5;

    const flattenInOrder = (columns) => {
        const list = [];
        columns.forEach(col => col.forEach(cls => list.push(cls)));
        return list;
    };

    const buildRows = (cls) => {
        const totalRunners = cls.runners.length;
        const finishedRunners = cls.runners.filter(r => r.status === 'finished');
        const runningRunners = cls.runners.filter(r => r.status === 'running');
        const checkedInRunners = cls.runners.filter(r => r.status === 'checked_in');
        const activeRunners = [...finishedRunners, ...runningRunners].sort((a,b)=>{
            const aTime = a.totalTime || Infinity; const bTime = b.totalTime || Infinity; return aTime - bTime;
        });
        const rows = [];
        const rowFinished = (runner) => (
            '<tr class="' + (runner.position===1?'gold-row':(runner.position===2?'silver-row':(runner.position===3?'bronze-row':''))) + '">' +
            '<td class="position">' + (runner.position || '-') + '</td>' +
            '<td class="runner-name">' + (runner.fullName||'') + '</td>' +
            '<td class="club">' + (runner.club||'') + '</td>' +
            '<td class="time">' + formatTime(runner.totalTime) + '</td>' +
            '<td class="diff">' + formatTime(runner.timeBehindLeader) + '</td>' +
            '<td class="lost">' + formatTime(runner.timeLost) + '</td>' +
            '</tr>'
        );
        const rowRunning = (runner) => (
            '<tr style="background: #ffffcc;">' +
            '<td class="position">-</td>' +
            '<td class="runner-name">' + (runner.fullName||'') + '</td>' +
            '<td class="club">' + (runner.club||'') + '</td>' +
            '<td class="time" style="color:#0066cc;font-weight:bold;">' + formatTime(runner.totalTime) + '</td>' +
            '<td colspan="2" style="text-align:center;color:#0066cc;font-weight:bold;">Running</td>' +
            '</tr>'
        );
        activeRunners.forEach(r=>{ rows.push(r.status==='running'?rowRunning(r):rowFinished(r)); });
        if (checkedInRunners.length>0 && activeRunners.length>0) {
            rows.push('<tr><td colspan="6" style="border-top: 2px solid #999; padding: 0;"></td></tr>');
        }
        checkedInRunners.sort((a,b)=> (a.fullName||'').localeCompare(b.fullName||''));
        checkedInRunners.forEach(r=>{
            rows.push('<tr style="opacity:0.6;">' +
                '<td class="position">-</td>' +
                '<td class="runner-name">' + (r.fullName||'') + '</td>' +
                '<td class="club">' + (r.club||'') + '</td>' +
                '<td colspan="3" style="text-align:center;font-style:italic;color:#666;">Checked In</td>' +
            '</tr>');
        });
        if (totalRunners===0) {
            rows.push('<tr><td colspan="6" style="text-align:center;font-style:italic;">No runners</td></tr>');
        }
        return rows;
    };

    // Ensure we never exceed user's max columns preference
    const actualOptimalColumns = Math.min(optimalColumns, maxColumnsAllowed);
    console.log(`[generateScreenHTML] optimalColumns=${optimalColumns}, maxColumnsAllowed=${maxColumnsAllowed}, actualOptimalColumns=${actualOptimalColumns}`);
    
    // Recalculate column distribution based on actualOptimalColumns, not the pre-divided columnSections
    const actualColumnSections = distributeToColumns(classResults, actualOptimalColumns);
    const orderedClasses = flattenInOrder(actualColumnSections);
    const classRows = orderedClasses.map(c=>({ cls:c, rows: buildRows(c) }));

    const estHeight = (rowCount) => headerH + tableHeaderH + rowCount * rowH + cardSpacing;

    const packByTarget = (numCols) => {
        const columns = Array(numCols).fill(null).map(()=>[]);
        const used = Array(numCols).fill(0);
        // Target height tries to equalize column bottoms across exactly numCols
        const totalH = classRows.reduce((s,it)=> s + estHeight(it.rows.length), 0);
        const target = Math.ceil(totalH / numCols); // aim for balanced columns, not forcing viewport height
        let colIdx = 0;
        const minRowsPerSegment = 3;

        for (let idx = 0; idx < classRows.length; idx++) {
            const item = classRows[idx];
            let remainingRows = item.rows.length;
            let startIndex = 0;
            let cont = false;

            while (remainingRows > 0) {
                if (colIdx >= numCols) return { success:false };
                const columnRemaining = availableHeight - used[colIdx];
                // Try to keep each column near target; if this is not the last column and we're over target, move on
                const colsLeft = (numCols - colIdx - 1);
                if (used[colIdx] >= target && colsLeft > 0) { colIdx++; continue; }

                const fixed = headerH + tableHeaderH + cardSpacing;
                const rowsFit = Math.floor((Math.min(target, availableHeight) - used[colIdx] - fixed) / rowH);

                if (rowsFit < minRowsPerSegment) {
                    // Not enough space here; move to next column
                    if (colsLeft > 0) { colIdx++; continue; }
                    // Last column: force place as much as fits
                    const rowsLast = Math.floor((columnRemaining - fixed) / rowH);
                    if (rowsLast <= 0) return { success:false };
                    const take = Math.max(1, Math.min(rowsLast, remainingRows));
                    const slice = item.rows.slice(startIndex, startIndex + take);
                    columns[colIdx].push({ cls: item.cls, rows: slice, cont });
                    used[colIdx] += fixed + slice.length * rowH;
                    remainingRows -= take;
                    startIndex += take;
                    cont = true;
                    continue;
                }

                const take = Math.min(rowsFit, remainingRows);
                const slice = item.rows.slice(startIndex, startIndex + take);
                columns[colIdx].push({ cls: item.cls, rows: slice, cont });
                used[colIdx] += fixed + slice.length * rowH;
                remainingRows -= take;
                startIndex += take;
                cont = true;

                // If we exceeded target by adding, advance column
                if (used[colIdx] >= target && colsLeft > 0) { colIdx++; }
            }
        }

        // Validate heights
        const ok = used.every(h => h <= availableHeight + rowH); // allow a little overflow due to safety
        return { success: ok, columns };
    };

    // Try from optimal columns up to user's max columns to achieve best packing
    console.log(`[packing] Starting with actualOptimalColumns=${actualOptimalColumns}, maxColumnsAllowed=${maxColumnsAllowed}`);
    let pack = packByTarget(actualOptimalColumns);
    let usedColumns = actualOptimalColumns;
    console.log(`[packing] Initial pack with ${actualOptimalColumns} cols: success=${pack.success}`);
    for (let c = actualOptimalColumns; (!pack.success) && c < maxColumnsAllowed; c++) {
        console.log(`[packing] Trying ${c+1} columns...`);
        const attempt = packByTarget(c+1);
        if (attempt.success) { pack = attempt; usedColumns = c+1; console.log(`[packing] Success with ${usedColumns} columns`); break; }
    }

    const renderSegment = (seg) => {
        const headerText = seg.cls.className + (seg.cont ? ' (cont)' : '');
        const km = (seg.cls.courseLength/1000).toFixed(1) + 'km';
        return (
            '<div class="class-card" style="--hh:' + headerH + 'px">' +
              '<div class="class-header-compact">' + headerText + ' | ' + km + '</div>' +
              '<table class="results-table">' +
                '<thead><tr>' +
                '<th class=\"col-pos\" style=\"width:10%;text-align:center;\">POS</th>' +
                '<th class=\"col-runner\" style=\"width:36%;\">RUNNER</th>' +
                '<th class=\"col-club\" style=\"width:12%;\">CLUB</th>' +
                '<th class=\"col-time\" style=\"width:14%;text-align:right;\">TIME</th>' +
                '<th class=\"col-diff\" style=\"width:14%;text-align:right;\">DIFF</th>' +
                '<th class=\"col-lost\" style=\"width:14%;text-align:right;\">LOST</th>' +
                '</tr></thead>' +
                '<tbody>' + seg.rows.join('') + '</tbody>' +
              '</table>' +
            '</div>'
        );
    };

    const effectiveColumns = pack.success ? usedColumns : actualOptimalColumns;
    console.log(`[rendering] pack.success=${pack.success}, effectiveColumns=${effectiveColumns}`);
    const columnsData = pack.success ? pack.columns : actualColumnSections;
    console.log(`[rendering] columnsData.length=${columnsData.length}`);
    const normalizedColumns = Array.from({ length: effectiveColumns }, (_, i) => columnsData[i] || []);
    console.log(`[rendering] normalizedColumns.length=${normalizedColumns.length}`);
    console.log(`[rendering] Final grid will have ${effectiveColumns} columns`);

    const contentHtml = normalizedColumns.map(column => {
        if (!pack.success) {
            // Fallback: render whole classes (no segmentation)
            return '<div class="column">' + column.map(classResult => generateClassHTML(classResult)).join('') + '</div>';
        }
        return '<div class="column">' + column.map(seg => renderSegment(seg)).join('') + '</div>';
    }).join('');
    const enableScrollFinal = (!pack.success) || needsScroll;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Results Screen ${screenNumber} of ${totalScreens}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            font-weight: 600;
            background: #ffffff;
            min-height: 100vh;
            padding: 5px;
            overflow: hidden;
        }
        .screen-header {
            background: #000;
            color: #FFD700;
            padding: 4px 10px;
            font-size: 16px;
            font-weight: 800;
            text-align: center;
            margin-bottom: 4px;
            border: 1px solid #FFD700;
        }
        .scroll-viewport { position: relative; height: calc(100vh - 44px); overflow: auto; width: 100%; -ms-overflow-style: none; scrollbar-width: none; }
        .scroll-viewport::-webkit-scrollbar { display: none; }
        .columns-container {
            display: grid;
            grid-template-columns: repeat(${effectiveColumns}, minmax(0, 1fr));
            gap: 6px;
            width: 100%;
        }
        .column { display: flex; flex-direction: column; min-height: 0; }
        .class-card {
            background: white;
            border-radius: 2px;
            margin-bottom: ${applied.cardMargin}px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid #333;
            flex-shrink: 0;
            position: relative;
            overflow: visible; /* allow sticky headers to work */
        }
        .class-header-compact {
            background: #333;
            color: white;
            padding: ${applied.headerPadding}px;
            font-size: ${applied.classTitle}px;
            font-weight: 800;
            border-bottom: 1px solid #FFD700;
            text-align: center;
            position: sticky;
            top: 0;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .results-table { position: relative; z-index: 1; }
        .results-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .results-table thead th {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            background: #000;
            color: #fff;
            padding: ${applied.padding}px;
            text-align: left;
            font-weight: 800;
            font-size: ${applied.tableHeader}px;
            border-bottom: 2px solid #FFD700;
            position: sticky;
            top: var(--hh, 28px); /* per-card header height variable */
            z-index: 9;
        }
        /* minimum widths optimized for better spacing */
        .results-table thead th.col-pos { min-width: 50px; }
        .results-table thead th.col-runner { min-width: 140px; }
        .results-table thead th.col-club { min-width: 60px; }
        .results-table thead th.col-time { min-width: 82px; }
        .results-table thead th.col-diff { min-width: 75px; }
        .results-table thead th.col-lost { min-width: 75px; }
        .results-table td {
            padding: ${applied.padding}px;
            border-bottom: 1px solid #ddd;
            font-size: ${applied.tableCell}px;
            font-weight: 600;
            line-height: 1.5;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .position { font-weight: 900; text-align: center; font-size: ${applied.position}px; }
        .gold-row { background: #FFD700 !important; border-left: 8px solid #B8860B !important; font-weight: 900; }
        .silver-row { background: #C0C0C0 !important; border-left: 6px solid #808080 !important; }
        .bronze-row { background: #CD7F32 !important; border-left: 6px solid #8B4513 !important; }
        .runner-name { font-weight: 900; font-size: ${applied.runnerName}px; }
        .time, .diff, .lost { font-family: monospace; text-align: right; font-weight: 700; }
        .club { color: #333; font-weight: 600; }
    </style>
</head>
<body>
    <div class="screen-header">
        SCREEN ${screenNumber} OF ${totalScreens} | ${effectiveColumns} COLS | ${classResults.reduce((sum, c) => sum + c.runners.length, 0)} RUNNERS | FONT: ${applied.tableCell}px${enableScrollFinal ? ' | SCROLL' : ''} | LIVE | ${new Date().toLocaleTimeString()}
    </div>
    <div class="scroll-viewport">
      <div class="columns-container">
        ${contentHtml}
      </div>
    </div>
    <script>
      (function(){
        const viewport = document.querySelector('.scroll-viewport');
        const content = document.querySelector('.columns-container');
        const enableScroll = ${enableScrollFinal};
        let rafId = null, pauseUntil = 0, y = Math.max(0, ${initialScrollY}|0), dir = 1;
        if (viewport) { viewport.scrollTop = y; }
        function cancel(){ if(rafId) cancelAnimationFrame(rafId); rafId = null; if(viewport) viewport.scrollTop = y; }
        function start(){
          if(!viewport || !content) return;
          const overflow = Math.max(0, content.scrollHeight - viewport.clientHeight);
          console.log('[Scroll Init] Content height: ' + content.scrollHeight + 'px, Viewport height: ' + viewport.clientHeight + 'px, Overflow: ' + overflow + 'px');
          if(overflow <= 0) {
            console.log('[Scroll Init] No overflow - content fits on screen, scrolling disabled');
            return;
          }
          const pxPerSec = Math.min(260, Math.max(28, overflow/35));
          const pauseMs = 2500;
          const cycleMs = overflow>0 ? Math.round(2*(overflow/pxPerSec)*1000 + 2*pauseMs) : 0;
          console.log('[Scroll Init] Starting scroll: speed=' + pxPerSec + 'px/s, pause=' + pauseMs + 'ms, cycle=' + cycleMs + 'ms');
          // Notify parent about cycle time at start
          try { window.opener && window.opener.postMessage({ type: 'lr_cycle', screen: ${screenNumber}, cycleMs: cycleMs }, '*'); } catch(e) {}
          function step(ts){ 
            if(!step.t) step.t = ts; 
            const dt=(ts-step.t)/1000; 
            step.t=ts; 
            
            // Check if we're in a pause
            if(pauseUntil > 0 && ts < pauseUntil){ 
              rafId=requestAnimationFrame(step); 
              return; 
            }
            
            // Update scroll position
            const prevY = y;
            y += dir*pxPerSec*dt; 
            
            // Check boundaries and set pause
            if(dir === 1 && y >= overflow){ 
              y = overflow; 
              dir = -1; 
              pauseUntil = ts + pauseMs;
              console.log('[Scroll] Reached BOTTOM, pausing for ' + pauseMs + 'ms, will scroll UP next');
            } else if(dir === -1 && y <= 0){ 
              y = 0; 
              dir = 1; 
              pauseUntil = ts + pauseMs;
              console.log('[Scroll] Reached TOP, pausing for ' + pauseMs + 'ms, will scroll DOWN next');
              // Schedule data refresh AFTER the pause completes
              setTimeout(function(){
                console.log('[Scroll] Pause complete, notifying parent to check for updates');
                try { window.opener && window.opener.postMessage({ type: 'lr_cycle', screen: ${screenNumber}, cycleMs: cycleMs }, '*'); } catch(e) {} 
              }, pauseMs);
            }
            
            viewport.scrollTop = y;
            try { window.__lastScrollY = y; } catch {}
            rafId=requestAnimationFrame(step); 
          }
          cancel(); rafId=requestAnimationFrame(step);
        }
        function init(){ cancel(); if(enableScroll) start(); else { const overflow = Math.max(0, content.scrollHeight - viewport.clientHeight); if(overflow>0) start(); } }
        window.addEventListener('resize', ()=>{ setTimeout(init, 250); });
        init();
      })();
    </script>
</body>
</html>`;
}

function generateClassHTML(classResult) {
    const totalRunners = classResult.runners.length;
    const finishedRunners = classResult.runners.filter(r => r.status === 'finished');
    const runningRunners = classResult.runners.filter(r => r.status === 'running');
    const checkedInRunners = classResult.runners.filter(r => r.status === 'checked_in');
    const finishedCount = finishedRunners.length;
    const runnersText = `${finishedCount}/${totalRunners}`;
    
    // Merge finished and running runners, sorted by time
    const activeRunners = [...finishedRunners, ...runningRunners].sort((a, b) => {
        const aTime = a.totalTime || Infinity;
        const bTime = b.totalTime || Infinity;
        return aTime - bTime;
    });
    
    const generateRunnerRow = (runner, isCheckedIn = false) => {
        // Keep position-based styling for finished runners
        const rowClass = runner.position === 1 ? 'gold-row' :
                       runner.position === 2 ? 'silver-row' :
                       runner.position === 3 ? 'bronze-row' : '';
        
        if (isCheckedIn) {
            // Checked-in runners only
            return `
                <tr style="opacity: 0.6;">
                    <td class="position">-</td>
                    <td class="runner-name">${runner.fullName}</td>
                    <td class="club">${runner.club || ''}</td>
                    <td colspan="3" style="text-align: center; font-style: italic; color: #666;">Checked In</td>
                </tr>
            `;
        }
        
        // Running runner display (mixed with finished)
        if (runner.status === 'running') {
            return `
                <tr style="background: #ffffcc;">
                    <td class="position">-</td>
                    <td class="runner-name">${runner.fullName}</td>
                    <td class="club">${runner.club || ''}</td>
                    <td class="time" style="color: #0066cc; font-weight: bold;">${formatTime(runner.totalTime)}</td>
                    <td colspan="2" style="text-align: center; color: #0066cc; font-weight: bold;">Running</td>
                </tr>
            `;
        }
        
        // Finished runner display
        return `
            <tr class="${rowClass}">
                <td class="position">${runner.position || '-'}</td>
                <td class="runner-name">${runner.fullName}</td>
                <td class="club">${runner.club || ''}</td>
                <td class="time">${formatTime(runner.totalTime)}</td>
                <td class="diff">${formatTime(runner.timeBehindLeader)}</td>
                <td class="lost">${formatTime(runner.timeLost)}</td>
            </tr>
        `;
    };
    
    // Sort checked-in runners alphabetically
    checkedInRunners.sort((a, b) => a.fullName.localeCompare(b.fullName));
    
    return `
        <div class="class-card">
            <div class="class-header-compact">
                ${classResult.className} | ${(classResult.courseLength / 1000).toFixed(1)}km | ${runnersText}
            </div>
            <table class="results-table">
                <thead>
                    <tr>
                        <th style="width: 8%; text-align: center;">POS</th>
                        <th style="width: 44%;">RUNNER</th>
                        <th style="width: 16%;">CLUB</th>
                        <th style="width: 12%; text-align: right;">TIME</th>
                        <th style="width: 10%; text-align: right;">DIFF</th>
                        <th style="width: 10%; text-align: right;">LOST</th>
                    </tr>
                </thead>
                <tbody>
                    ${totalRunners === 0 ? '<tr><td colspan="6" style="text-align: center; font-style: italic;">No runners</td></tr>' : ''}
                    ${activeRunners.map(r => generateRunnerRow(r, false)).join('')}
                    ${checkedInRunners.length > 0 && activeRunners.length > 0 ? '<tr><td colspan="6" style="border-top: 2px solid #999; padding: 0;"></td></tr>' : ''}
                    ${checkedInRunners.map(r => generateRunnerRow(r, true)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function generateScreenLinks(numScreens) {
    let html = '<div style="text-align: center; padding: 40px;">';
    html += '<h2>Multi-Screen Results Active</h2>';
    html += `<p>${numScreens} screen window(s) should now be open. Drag each window to a different monitor for optimal viewing.</p>`;
    
    if (numScreens > 1) {
        html += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin: 20px 0; font-size: 14px;">';
        html += '<strong>💡 Tip:</strong> If windows didn\'t open, your browser may be blocking popups. <br>';
        html += 'Look for a popup blocker icon in your address bar and click "Allow popups" for this site.';
        html += '</div>';
    }
    
    html += '<div style="display: flex; gap: 20px; justify-content: center; margin-top: 30px;">';
    
    for (let i = 1; i <= numScreens; i++) {
        html += `
            <div style="background: #e6ffe6; padding: 20px; border-radius: 8px; border: 2px solid #00AA00;">
                <h3>📺 Screen ${i}</h3>
                <p style="color: #00AA00; font-weight: bold;">WINDOW ACTIVE</p>
                <small>Drag to Monitor ${i}</small>
            </div>
        `;
    }
    
    html += '</div>';
    html += '<div style="margin-top: 30px;">';
    html += '<p><strong>Master Control:</strong> Use the screen selector above to add/remove screens. All open windows will update automatically.</p>';
    html += '</div>';
    html += '</div>';
    return html;
}

function formatTime(ms) {
    if (!ms || ms === 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateLastUpdateTime() {
    lastUpdateTime = new Date();
}

function updateStatusDisplay() {
    const statusElement = document.getElementById('lastUpdate');
    const dataSourceElement = document.getElementById('dataSource');
    const now = new Date().toLocaleTimeString();

    if (apiStatus === 'online') {
        statusElement.textContent = `API Connected • ${now}`;
        statusElement.style.color = '#00AA00';
        if (dataSourceElement) {
            dataSourceElement.textContent = '✅ MeOS API';
            dataSourceElement.style.color = '#00AA00';
        }
    } else {
        statusElement.textContent = `API Offline • ${now}`;
        statusElement.style.color = '#FF0000';
        if (dataSourceElement) {
            dataSourceElement.textContent = '❌ API Offline';
            dataSourceElement.style.color = '#FF0000';
        }
    }
}
