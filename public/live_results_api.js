// Configuration
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

// Configuration state
let screenCount = 1;

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

    refreshIntervalId = setInterval(async () => {
        if (apiStatus === 'online') {
            await fetchResults();
        }
    }, REFRESH_INTERVAL);
}

function loadConfiguration() {
    const savedConfig = localStorage.getItem('liveResults_config');
    if (savedConfig) {
        const config = JSON.parse(savedConfig);
        screenCount = config.screenCount || 1;
        document.getElementById('screenCount').value = screenCount;

        if (config.refreshInterval) {
            REFRESH_INTERVAL = config.refreshInterval * 1000;
            document.getElementById('refreshInterval').value = config.refreshInterval;
        }
    }
}

function saveConfiguration() {
    const config = {
        screenCount,
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
        saveConfiguration();
        startAutoRefresh();
    });
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

        currentResults = classResults;
        displayResults(classResults);
        updateLastUpdateTime();

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

async function enrichWithSplitAnalysis(resultsByClass) {
    for (const className in resultsByClass) {
        const classResult = resultsByClass[className];
        const finishedRunners = classResult.runners.filter(r => r.status === 'finished');

        console.log(`🔍 Fetching split analysis for ${finishedRunners.length} runners in ${className}...`);

        for (const runner of finishedRunners) {
            if (!runner.competitorId) continue;

            try {
                const details = await lookupCompetitor(parseInt(runner.competitorId));

                if (details && details.splits) {
                    runner.timeLost = calculateTotalTimeLost(details.splits);
                }
            } catch (error) {
                console.warn(`  ❌ Failed to get analysis for ${runner.fullName}:`, error);
            }
        }
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
        const html = generateScreenHTML(section, screenNumber, numScreens);
        
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
    let bestLayout = null;
    let bestFontSize = 0;
    
    const availableWidth = (window.innerWidth || 1920) - 20;
    const minColumnWidth = 280;
    
    // Smart max columns: prefer fewer columns to use vertical space better
    // Don't exceed number of classes, and cap based on screen width
    const maxColumnsByWidth = Math.floor(availableWidth / minColumnWidth);
    const maxColumnsByClasses = Math.min(classResults.length, Math.ceil(classResults.length / 2)); // At least 2 classes per column
    const maxColumns = Math.min(6, maxColumnsByWidth, maxColumnsByClasses);
    
    console.log(`Finding optimal layout for screen: ${classResults.length} classes, max ${maxColumns} columns (width allows ${maxColumnsByWidth})`);
    
    for (let numColumns = 1; numColumns <= maxColumns; numColumns++) {
        const columnSections = distributeToColumns(classResults, numColumns);
        if (columnSections.some(col => col.length === 0)) continue;
        
        const fontSizes = calculateFontSizesForLayout(columnSections, availableHeight);
        const score = fontSizes.tableCell;
        
        console.log(`  ${numColumns} cols: ${score}px font`);
        
        // Prefer fewer columns if font size is similar (within 10%)
        // This prioritizes vertical space utilization
        if (!bestLayout || score > bestFontSize * 1.1) {
            bestLayout = { optimalColumns: numColumns, columnSections, fontSizes };
            bestFontSize = score;
        }
    }
    
    if (!bestLayout) {
        const columnSections = [classResults];
        const fontSizes = calculateFontSizesForLayout(columnSections, availableHeight);
        bestLayout = { optimalColumns: 1, columnSections, fontSizes };
    }
    
    console.log(`Best layout: ${bestLayout.optimalColumns} cols, ${bestFontSize}px font`);
    return bestLayout;
}

function distributeToColumns(classResults, numColumns) {
    const columns = Array(numColumns).fill(null).map(() => []);
    
    // Try to balance by runner count instead of just class count
    // This creates more even columns when classes have different sizes
    const columnRunnerCounts = Array(numColumns).fill(0);
    
    classResults.forEach(classResult => {
        // Put this class in the column with fewest runners so far
        const minIndex = columnRunnerCounts.indexOf(Math.min(...columnRunnerCounts));
        columns[minIndex].push(classResult);
        columnRunnerCounts[minIndex] += classResult.runners.length;
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

function generateScreenHTML(classResults, screenNumber, totalScreens) {
    const { optimalColumns, columnSections, fontSizes } = findOptimalLayoutForScreen(classResults, (window.innerHeight || 1080) - 50);
    
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
            background: #ffffff;
            min-height: 100vh;
            padding: 5px;
            overflow-x: hidden;
        }
        .screen-header {
            background: #000;
            color: #FFD700;
            padding: 3px 10px;
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 3px;
            border: 1px solid #FFD700;
        }
        .columns-container {
            display: grid;
            grid-template-columns: repeat(${optimalColumns}, 1fr);
            gap: 5px;
            height: calc(100vh - 40px);
            overflow: hidden;
        }
        .column { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .class-card {
            background: white;
            border-radius: 2px;
            margin-bottom: ${fontSizes.cardMargin}px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
            border: 1px solid #333;
            flex-shrink: 0;
        }
        .class-header-compact {
            background: #333;
            color: white;
            padding: ${fontSizes.headerPadding}px;
            font-size: ${fontSizes.classTitle}px;
            font-weight: bold;
            border-bottom: 1px solid #FFD700;
            text-align: center;
        }
        .results-table { width: 100%; border-collapse: collapse; }
        .results-table th {
            background: #333333;
            color: white;
            padding: ${fontSizes.padding}px;
            text-align: left;
            font-weight: bold;
            font-size: ${fontSizes.tableHeader}px;
            border-bottom: 1px solid #FFD700;
        }
        .results-table td {
            padding: ${fontSizes.padding}px;
            border-bottom: 1px solid #ddd;
            font-size: ${fontSizes.tableCell}px;
            line-height: 1.4;
        }
        .position {
            font-weight: bold;
            text-align: center;
            font-size: ${fontSizes.position}px;
        }
        .gold-row { background: #FFD700 !important; border-left: 8px solid #B8860B !important; font-weight: bold; }
        .silver-row { background: #C0C0C0 !important; border-left: 6px solid #808080 !important; }
        .bronze-row { background: #CD7F32 !important; border-left: 6px solid #8B4513 !important; }
        .runner-name { font-weight: bold; font-size: ${fontSizes.runnerName}px; }
        .time, .diff, .lost { font-family: monospace; text-align: right; }
        .club { color: #666; }
        .status-tag {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: ${Math.max(5, fontSizes.tableCell - 2)}px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-finished { background: #00CC00; color: white; }
        .status-dnf { background: #CC0000; color: white; }
        .status-dns { background: #FF8800; color: white; }
    </style>
</head>
<body>
    <div class="screen-header">
        SCREEN ${screenNumber} OF ${totalScreens} | ${optimalColumns} COLS | ${classResults.reduce((sum, c) => sum + c.runners.length, 0)} RUNNERS | FONT: ${fontSizes.tableCell}px | ${new Date().toLocaleTimeString()}
    </div>
    <div class="columns-container">
        ${columnSections.map(column => `
            <div class="column">
                ${column.map(classResult => generateClassHTML(classResult)).join('')}
            </div>
        `).join('')}
    </div>
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
                        <th style="width: 50px; text-align: center;">POS</th>
                        <th style="width: 180px;">RUNNER</th>
                        <th style="width: 100px;">CLUB</th>
                        <th style="width: 70px; text-align: right;">TIME</th>
                        <th style="width: 70px; text-align: right;">DIFF</th>
                        <th style="width: 70px; text-align: right;">LOST</th>
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
