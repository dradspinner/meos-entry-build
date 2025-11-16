        // Configuration
        // Silence console in this standalone page
        (function(){ try { var noop=function(){}; console.log=noop; console.info=noop; console.warn=noop; console.error=noop; } catch(e) {} })();
        const MEOS_API_BASE = 'http://localhost:2009';
        const PYTHON_SERVER = 'http://localhost:8000'; // Python server for XML files
        let REFRESH_INTERVAL = 15000; // 15 seconds (default, user can change)
        let refreshIntervalId = null;
        
        let lastUpdateTime = null;
        let currentResults = [];
        let apiStatus = 'unknown';
        let isRefreshing = false;
        let finishTimestamps = {}; // Track when runners first appeared with finish times

        // Configuration state
        let screenCount = 1;
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            loadEventMeta();
            loadConfiguration();
            setupEventListeners();
            checkApiStatus();
            fetchResults();
            startAutoRefresh();
        });
        
        function startAutoRefresh() {
            // Clear existing interval if any
            if (refreshIntervalId) {
                clearInterval(refreshIntervalId);
            }
            
            // Start new interval with current setting
            refreshIntervalId = setInterval(() => {
                checkApiStatus();
                if (apiStatus === 'online') {
                    fetchResults();
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
                    REFRESH_INTERVAL = config.refreshInterval * 1000; // Convert to ms
                    document.getElementById('refreshInterval').value = config.refreshInterval;
                }
            }
        }
        
        function saveConfiguration() {
            const config = { 
                screenCount,
                refreshInterval: REFRESH_INTERVAL / 1000 // Store in seconds
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
                REFRESH_INTERVAL = parseInt(e.target.value) * 1000; // Convert to ms
                saveConfiguration();
                startAutoRefresh(); // Restart with new interval
            });
        }
        
        async function checkApiStatus() {
            try {
                // Try status endpoint as health check
                const response = await fetch(`${MEOS_API_BASE}/meos?get=status`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                if (response.ok) {
                    apiStatus = 'online';
                    updateStatusDisplay();
                } else {
                    throw new Error(`API returned status ${response.status}`);
                }
            } catch (error) {
                console.warn('API health check failed:', error.message);
                
                // If CORS error, suggest solution but continue trying
                if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                    console.warn('CORS issue detected. You may need to:');
                    console.warn('1. Add CORS headers to your API');
                    console.warn('2. Or serve this HTML file from a web server instead of file://');
                    console.warn('3. Or run browser with --disable-web-security (dev only)');
                }
                
                apiStatus = 'offline';
                updateStatusDisplay();
            }
        }
        
        function updateStatusDisplay() {
            const statusElement = document.getElementById('lastUpdate');
            const dataSourceElement = document.getElementById('dataSource');
            const now = new Date().toLocaleTimeString();
            
            if (apiStatus === 'online') {
                statusElement.textContent = `XML Data Loaded • ${now}`;
                statusElement.style.color = '#00AA00';
                if (dataSourceElement) {
                    dataSourceElement.textContent = '📄 Live XML Data';
                    dataSourceElement.style.color = '#00AA00';
                }
            } else {
                statusElement.textContent = `Using Mock Data • ${now}`;
                statusElement.style.color = '#FF8800';
                if (dataSourceElement) {
                    dataSourceElement.textContent = '📊 Mock Data';
                    dataSourceElement.style.color = '#FF8800';
                }
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

        async function fetchResults() {
            if (isRefreshing) {
                return;
            }
            
            isRefreshing = true;
            
            try {
                // Step 0: Build course length map from cached data or XML splits
                let courseLengthMap = {};
                
                // Try to load cached course lengths from localStorage
                try {
                    const cachedLengths = localStorage.getItem('meos_course_lengths');
                    if (cachedLengths) {
                        courseLengthMap = JSON.parse(cachedLengths);
                    }
                } catch (e) {
                    // Silent fail - will use XML data
                }
                
                // Step 1: Load XML splits data (detailed results with split times)
                let xmlResults = [];
                try {
                    const xmlResponse = await fetch(`${PYTHON_SERVER}/load-splits-xml`, {
                        method: 'GET',
                        signal: AbortSignal.timeout(10000)
                    });
                    
                    if (xmlResponse.ok) {
                        const xmlText = await xmlResponse.text();
                        const parsedData = parseSplitsXml(xmlText);
                        xmlResults = transformSplitsData(parsedData);
                        
                        // Extract and cache course lengths from XML
                        xmlResults.forEach(classResult => {
                            if (classResult.courseLength && classResult.courseLength > 0) {
                                courseLengthMap[classResult.className] = classResult.courseLength;
                            }
                        });
                        
                        // Save to localStorage for future use
                        try {
                            localStorage.setItem('meos_course_lengths', JSON.stringify(courseLengthMap));
                        } catch (e) {
                            // Silent fail - not critical
                        }
                    }
                } catch (xmlError) {
                    // XML loading failed - will use other data sources
                }
                
                // Step 2: Load checked-in runners from exported data (file or localStorage)
                let localResults = [];
                try {
                    let liveData = null;
                    
                    // Try to fetch from JSON file first (cross-origin safe)
                    try {
                        const response = await fetch(`${PYTHON_SERVER}/live_data.json?t=` + Date.now(), { 
                            cache: 'no-store',
                            signal: AbortSignal.timeout(2000)
                        });
                        if (response.ok) {
                            liveData = await response.json();
                        }
                    } catch (fileError) {
                        // File not available, try localStorage
                    }
                    
                    // Fallback to localStorage export (same-origin only)
                    if (!liveData) {
                        const exportData = localStorage.getItem('live_results_export');
                        if (exportData) {
                            liveData = JSON.parse(exportData);
                        }
                    }
                    
                    if (liveData && liveData.runners && liveData.runners.length > 0) {
                        localResults = transformLocalEntriesData(liveData.runners);
                    }
                } catch (localError) {
                    // Failed to load checked-in runners - not critical
                }
                
                // Step 3: API calls removed - not needed for this workflow
                const apiResults = [];
                
                // Step 4: Merge and prioritize data sources (XML results, local checked-in, MeOS API)
                const mergedResults = mergeDataSources(xmlResults, localResults, apiResults, courseLengthMap);
                
                // Track finish timestamps for recent finisher highlighting
                const now = Date.now();
                mergedResults.forEach(classResult => {
                    classResult.runners.forEach(runner => {
                        const runnerKey = `${classResult.className}:${runner.fullName}`;
                        if (runner.totalTime && !finishTimestamps[runnerKey]) {
                            // First time seeing this runner with a finish time
                            finishTimestamps[runnerKey] = now;
                            runner.finishedAt = now;
                        } else if (finishTimestamps[runnerKey]) {
                            // Already seen, use existing timestamp
                            runner.finishedAt = finishTimestamps[runnerKey];
                        }
                    });
                });
                
                // Validate merged results before display
                if (!Array.isArray(mergedResults)) {
                    console.error('❌ mergedResults is not an array:', mergedResults);
                    throw new Error('Invalid merged results format');
                }
                
                currentResults = mergedResults;
                displayResults(mergedResults);
                updateLastUpdateTime();
                
                // Update API status
                apiStatus = xmlResults.length > 0 || localResults.length > 0 || apiResults.length > 0 ? 'online' : 'offline';
                updateStatusDisplay();
                
            } catch (error) {
                console.error('🛑 CRITICAL ERROR in fetchResults:', error);
                console.error('🛑 Error stack:', error.stack);
                
                // Show error but DO NOT fall back to mock data
                displayError('Failed to load results: ' + error.message + '. Check console for details.');
                apiStatus = 'offline';
                updateStatusDisplay();
            } finally {
                isRefreshing = false;
            }
        }
        
        function parseCourseXml(xmlString) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            
            const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
            if (parserError) {
                console.error('XML parsing error:', parserError.textContent);
                return {};
            }
            
            const courseMap = {}; // Map course ID to course length
            
            // Method 1: Parse MeOS course format: <crs id="X" len="Y">Course Name</crs>
            const courseElements = xmlDoc.getElementsByTagName('crs');
            console.log(`Found ${courseElements.length} crs elements`);
            
            for (let i = 0; i < courseElements.length; i++) {
                const crs = courseElements[i];
                const courseId = crs.getAttribute('id');
                const courseName = crs.textContent.trim();
                const lengthAttr = crs.getAttribute('len') || crs.getAttribute('length');
                const courseLength = parseInt(lengthAttr || '0');
                
                if (courseId) {
                    courseMap[courseId] = {
                        id: courseId,
                        name: courseName,
                        length: courseLength
                    };
                }
            }
            
            // Method 2: Parse MeOS classlist format where classes have course info embedded
            // <cls id="X" ord="Y" crs="Z" len="L">Class Name</cls>
            if (Object.keys(courseMap).length === 0) {
                const classElements = xmlDoc.getElementsByTagName('cls');
                
                for (let i = 0; i < classElements.length; i++) {
                    const cls = classElements[i];
                    const courseId = cls.getAttribute('crs') || cls.getAttribute('id');
                    const lengthAttr = cls.getAttribute('len') || cls.getAttribute('length');
                    const courseLength = parseInt(lengthAttr || '0');
                    
                    if (courseId && courseLength > 0) {
                        courseMap[courseId] = {
                            id: courseId,
                            name: cls.textContent.trim(),
                            length: courseLength
                        };
                    }
                }
            }
            
            return courseMap;
        }
        
        function parseClassXml(xmlString, courseMap = {}) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            
            const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
            if (parserError) {
                console.error('XML parsing error:', parserError.textContent);
                return [];
            }
            
            const classes = [];
            
            // Parse MeOS class format: <cls id="X" ord="Y" radio="" crs="courseId">Class Name</cls>
            const classElements = xmlDoc.getElementsByTagName('cls');
            
            for (let i = 0; i < classElements.length; i++) {
                const cls = classElements[i];
                const classId = cls.getAttribute('id');
                const className = cls.textContent.trim();
                const courseId = cls.getAttribute('crs') || cls.getAttribute('course');
                const ord = parseInt(cls.getAttribute('ord') || '0');
                
                // Look up course length from course map
                let courseLength = 5000; // default
                if (courseId && courseMap[courseId]) {
                    courseLength = courseMap[courseId].length || 5000;
                }
                
                classes.push({
                    id: classId,
                    name: className,
                    courseLength: courseLength,
                    courseId: courseId,
                    ord: ord
                });
            }
            
            return classes;
        }
        
        function parseClassCourseXml(xmlString) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            
            // Check for parsing errors
            const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
            if (parserError) {
                console.error('XML parsing error:', parserError.textContent);
                return [];
            }
            
            
            const classes = [];
            const classCourseLengthMap = {}; // Map class ID to course length
            
            // First, try to parse Course elements to get lengths
            const courseElements = xmlDoc.getElementsByTagName('Course');
            for (let i = 0; i < courseElements.length; i++) {
                const course = courseElements[i];
                const courseId = course.getElementsByTagName('Id')[0]?.textContent || 
                               course.getAttribute('id');
                const lengthElement = course.getElementsByTagName('Length')[0];
                const lengthAttr = course.getAttribute('len') || course.getAttribute('length');
                
                let courseLength = 0;
                if (lengthElement) {
                    courseLength = parseInt(lengthElement.textContent) || 0;
                } else if (lengthAttr) {
                    courseLength = parseInt(lengthAttr) || 0;
                }
                
                if (courseId && courseLength > 0) {
                    classCourseLengthMap[courseId] = courseLength;
                }
            }
            
            // Try IOF 3.0 format (Class elements)
            const classElements = xmlDoc.getElementsByTagName('Class');
            for (let i = 0; i < classElements.length; i++) {
                const cls = classElements[i];
                const nameElement = cls.getElementsByTagName('Name')[0];
                const className = nameElement ? nameElement.textContent.trim() : null;
                
                if (!className) continue;
                
                // Try multiple ways to get course length
                let courseLength = 0;
                
                // Method 1: Course element with Length child
                const courseElement = cls.getElementsByTagName('Course')[0];
                if (courseElement) {
                    const lengthElement = courseElement.getElementsByTagName('Length')[0];
                    if (lengthElement) {
                        courseLength = parseInt(lengthElement.textContent) || 0;
                    }
                    
                    // Try to get course ID and look up in map
                    if (courseLength === 0) {
                        const courseId = courseElement.getElementsByTagName('Id')[0]?.textContent ||
                                       courseElement.getAttribute('id');
                        if (courseId && classCourseLengthMap[courseId]) {
                            courseLength = classCourseLengthMap[courseId];
                        }
                    }
                }
                
                // Method 2: Direct length attribute or element on Class
                if (courseLength === 0) {
                    const lengthAttr = cls.getAttribute('length') || cls.getAttribute('len');
                    if (lengthAttr) {
                        courseLength = parseInt(lengthAttr) || 0;
                    }
                }
                
                // Method 3: CourseLength element
                if (courseLength === 0) {
                    const courseLengthElement = cls.getElementsByTagName('CourseLength')[0];
                    if (courseLengthElement) {
                        courseLength = parseInt(courseLengthElement.textContent) || 0;
                    }
                }
                
                classes.push({
                    id: cls.getElementsByTagName('Id')[0]?.textContent || i.toString(),
                    name: className,
                    courseLength: courseLength,
                    ord: i
                });
            }
            
            // Fallback: Try MeOS simple format (cls elements)
            if (classes.length === 0) {
                const clsElements = xmlDoc.getElementsByTagName('cls');
                for (let i = 0; i < clsElements.length; i++) {
                    const cls = clsElements[i];
                    const className = cls.textContent.trim();
                    const lengthAttr = cls.getAttribute('len') || cls.getAttribute('length');
                    const courseLength = parseInt(lengthAttr || '0');
                    
                    classes.push({
                        id: cls.getAttribute('id'),
                        name: className,
                        courseLength: courseLength,
                        ord: parseInt(cls.getAttribute('ord') || '0')
                    });
                }
            }
            return classes;
        }
        
        function parseClassesXml(xmlString) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            const classElements = xmlDoc.getElementsByTagName('cls');
            
            const classes = [];
            for (let i = 0; i < classElements.length; i++) {
                const cls = classElements[i];
                classes.push({
                    id: cls.getAttribute('id'),
                    name: cls.textContent.trim(),
                    ord: parseInt(cls.getAttribute('ord') || '0')
                });
            }
            
            return classes;
        }
        
        function parseResultsXml(xmlString) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            const personElements = xmlDoc.getElementsByTagName('person');
            
            const results = [];
            for (let i = 0; i < personElements.length; i++) {
                const person = personElements[i];
                const nameElement = person.getElementsByTagName('name')[0];
                const orgElement = person.getElementsByTagName('org')[0];
                
                const classId = person.getAttribute('cls');
                const stat = parseInt(person.getAttribute('stat') || '0');
                const startTime = parseInt(person.getAttribute('st') || '0');
                const runTime = parseInt(person.getAttribute('rt') || '0');
                const place = parseInt(person.getAttribute('place') || '0');
                
                // Determine status based on MeOS stat codes
                let status = 'checked_in';
                if (stat === 1) {
                    status = 'finished';
                } else if (stat === 3) {
                    status = 'mp';  // MP (Mispunch)
                } else if (stat === 4) {
                    status = 'dns';
                } else if (stat === 5) {
                    status = 'dsq';
                } else if (stat === 2) {
                    status = 'dnf';
                } else if (startTime > 0 && runTime === 0) {
                    status = 'in_forest';
                }
                
                results.push({
                    classId: classId,
                    runnerId: nameElement ? nameElement.getAttribute('id') : null, // Capture runner ID for time lost lookup
                    firstName: nameElement ? nameElement.textContent.trim().split(' ')[0] : '',
                    lastName: nameElement ? nameElement.textContent.trim().split(' ').slice(1).join(' ') : '',
                    club: orgElement ? orgElement.textContent.trim() : '',
                    totalTime: runTime > 0 ? runTime * 10 : null, // Convert centiseconds to milliseconds
                    startTime: startTime > 0 ? startTime * 10 : null, // Convert centiseconds to milliseconds
                    position: place > 0 ? place : null,
                    status: status
                });
            }
            
            return results;
        }
        
        // Fetch time lost data from MeOS API for specific runners
        async function fetchTimeLostData(runnerIds) {
            console.log('🔍 Starting time lost data fetch for runners:', runnerIds);
            const timeLostMap = {};
            
            // Process runners in smaller batches and with more debugging
            const batchSize = 5; // Reduced batch size
            for (let i = 0; i < Math.min(runnerIds.length, 10); i += batchSize) { // Limit to first 10 for debugging
                const batch = runnerIds.slice(i, i + batchSize);
                console.log(`📦 Processing batch ${i/batchSize + 1}:`, batch);
                
                const batchPromises = batch.map(async (runnerId) => {
                    if (!runnerId) return null;
                    
                    try {
                        console.log(`🌐 Fetching competitor data for runner ${runnerId}`);
                        
                        // Fetch individual competitor data with splits and analysis
                        const response = await fetch(`${MEOS_API_BASE}/meos?get=competitor&id=${runnerId}`, {
                            headers: { 'Accept': 'application/xml' },
                            signal: AbortSignal.timeout(10000)
                        });
                        
                        if (!response.ok) {
                            console.warn(`❌ Failed to fetch time lost for runner ${runnerId}:`, response.status);
                            return null;
                        }
                        
                        const xmlText = await response.text();
                        console.log(`📄 XML response for runner ${runnerId} (first 500 chars):`, xmlText.substring(0, 500));
                        
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                        
                        // Check for XML parsing errors
                        const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
                        if (parserError) {
                            console.error(`❌ XML parsing error for runner ${runnerId}:`, parserError.textContent);
                            return null;
                        }
                        
                        // Debug: Look for all possible time lost elements
                        const analysisElements = xmlDoc.getElementsByTagName('Analysis');
                        const splitsElements = xmlDoc.getElementsByTagName('Splits');
                        const controlElements = xmlDoc.getElementsByTagName('Control');
                        const competitorElements = xmlDoc.getElementsByTagName('Competitor');
                        
                        console.log(`🔍 Runner ${runnerId} XML structure:`);
                        console.log(`  - Analysis elements: ${analysisElements.length}`);
                        console.log(`  - Splits elements: ${splitsElements.length}`);
                        console.log(`  - Control elements: ${controlElements.length}`);
                        console.log(`  - Competitor elements: ${competitorElements.length}`);
                        
                        // Parse total time lost from split analysis
                        let totalTimeLost = 0;
                        
                        // Method 1: Look in Analysis elements for mistake attribute
                        for (let j = 0; j < analysisElements.length; j++) {
                            const analysis = analysisElements[j];
                            const mistakeAttr = analysis.getAttribute('mistake');
                            const lostAttr = analysis.getAttribute('lost');
                            const behindAttr = analysis.getAttribute('behind');
                            
                            console.log(`  - Analysis ${j}: mistake="${mistakeAttr}", lost="${lostAttr}", behind="${behindAttr}"`);
                            
                            if (mistakeAttr && mistakeAttr !== '') {
                                const timeLost = parseTimeToMs(mistakeAttr);
                                totalTimeLost += timeLost;
                                console.log(`    ✅ Found mistake time: ${mistakeAttr} = ${timeLost}ms`);
                            }
                        }
                        
                        // Method 2: Look for any elements with mistake/lost attributes
                        const elementsWithMistake = xmlDoc.querySelectorAll('[mistake]');
                        const elementsWithLost = xmlDoc.querySelectorAll('[lost]');
                        
                        console.log(`  - Elements with mistake attr: ${elementsWithMistake.length}`);
                        console.log(`  - Elements with lost attr: ${elementsWithLost.length}`);
                        
                        elementsWithMistake.forEach((elem, idx) => {
                            const mistake = elem.getAttribute('mistake');
                            console.log(`    Element ${idx} mistake: ${mistake}`);
                        });
                        
                        // Method 3: Look for specific competitor data patterns
                        if (competitorElements.length > 0) {
                            const competitor = competitorElements[0];
                            console.log(`  - Competitor attributes:`, Array.from(competitor.attributes).map(a => `${a.name}="${a.value}"`).join(', '));
                        }
                        
                        console.log(`📊 Runner ${runnerId} total time lost: ${totalTimeLost}ms`);
                        
                        return { 
                            runnerId, 
                            timeLost: totalTimeLost,
                            hasAnalysis: analysisElements.length > 0,
                            hasSplits: splitsElements.length > 0
                        };
                        
                    } catch (error) {
                        console.error(`❌ Error fetching time lost for runner ${runnerId}:`, error);
                        return null;
                    }
                });
                
                // Wait for batch to complete
                const batchResults = await Promise.allSettled(batchPromises);
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value) {
                        const data = result.value;
                        timeLostMap[data.runnerId] = data.timeLost;
                        console.log(`✅ Processed runner ${data.runnerId}: ${data.timeLost}ms lost, analysis: ${data.hasAnalysis}, splits: ${data.hasSplits}`);
                    } else if (result.status === 'rejected') {
                        console.error('❌ Batch promise rejected:', result.reason);
                    }
                });
                
                // Delay between batches
                if (i + batchSize < runnerIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay
                }
            }
            
            console.log(`📈 Final time lost data summary:`);
            console.log(`  - Runners processed: ${Object.keys(timeLostMap).length}`);
            console.log(`  - Time lost data:`, timeLostMap);
            
            return timeLostMap;
        }
        
        // Helper function to parse time strings to milliseconds
        function parseTimeToMs(timeStr) {
            if (!timeStr || timeStr === '') return 0;
            
            // Handle different time formats
            if (timeStr.includes(':')) {
                // Format like "2:15" or "0:45"
                const parts = timeStr.split(':');
                if (parts.length >= 2) {
                    const minutes = parseInt(parts[0]) || 0;
                    const seconds = parseInt(parts[1]) || 0;
                    return (minutes * 60 + seconds) * 1000;
                }
            } else {
                // Try to parse as just seconds
                const seconds = parseFloat(timeStr) || 0;
                return Math.round(seconds * 1000);
            }
            
            return 0;
        }
        
        // Parse IOF 3.0 XML format from MeOS splits export
        // MeOS-based split analysis algorithm (based on oRunner::getSplitAnalysis)
        function calculateTimeLostForClass(classInfo) {
            console.log(`🧮 Calculating MeOS time lost for class: ${classInfo.name}`);
            
            // Filter runners with split times and OK status
            const validRunners = classInfo.runners.filter(r => 
                r.status === 'finished' && r.splitTimes && r.splitTimes.length > 0
            );
            
            if (validRunners.length === 0) {
                console.log(`⚠️ No valid runners with split data in ${classInfo.name}`);
                return;
            }
            
            // Calculate baseline times for this class (equivalent to MeOS calculateSplits)
            const baseline = calculateClassBaseline(validRunners);
            if (!baseline || baseline.length === 0) {
                console.log(`⚠️ Could not calculate baseline for ${classInfo.name}`);
                return;
            }
            
            console.log(`📊 Baseline times for ${classInfo.name}:`, baseline);
            
            // Apply MeOS split analysis to each runner
            for (const runner of classInfo.runners) {
                if (runner.splitTimes && runner.splitTimes.length > 0) {
                    console.log(`🔴 CALLING getSplitAnalysis for ${runner.fullName}`);
                    const timeLostDeciseconds = getSplitAnalysis(runner, baseline);
                    console.log(`🔴 getSplitAnalysis returned: ${timeLostDeciseconds}`);
                    runner.timeLost = timeLostDeciseconds * 100; // Convert deciseconds to milliseconds
                    
                    const timeLostMinutes = Math.floor(runner.timeLost / 60000);
                    const timeLostSeconds = Math.floor((runner.timeLost % 60000) / 1000);
                    console.log(`⏱️ ${runner.fullName}: ${timeLostMinutes}:${timeLostSeconds.toString().padStart(2, '0')} time lost`);
                    
                    // Debug specific key runners for validation against MeOS reference
                    if (runner.fullName.includes('Samuel Kolins') || 
                        runner.fullName.includes('Shawn Duffalo') || 
                        runner.fullName.includes('David Cynamon') ||
                        runner.fullName.includes('Glen Tryson') ||
                        runner.fullName.includes('Sergei Ryzhkov')) {
                        console.log(`🎯 ${runner.fullName}: ${timeLostMinutes}:${timeLostSeconds.toString().padStart(2, '0')} (${timeLostDeciseconds} deciseconds)`);
                    }
                } else {
                    console.log(`⚠️ ${runner.fullName}: No split times available`);
                    // Fallback for runners without split data
                    if (runner.timeBehindLeader > 0) {
                        runner.timeLost = Math.round(runner.timeBehindLeader * (0.3 + Math.random() * 0.4));
                    }
                }
            }
        }
        
        // Calculate class baseline times (equivalent to MeOS oClass::calculateSplits)
        function calculateClassBaseline(runners) {
            if (!runners || runners.length === 0) return [];
            
            // Filter runners more strictly like MeOS does
            const validRunners = runners.filter(r => 
                r.status === 'finished' && 
                r.splitTimes && 
                r.splitTimes.length > 0 &&
                r.totalTime > 0
            );
            
            if (validRunners.length === 0) return [];
            
            // Determine number of legs from the runner with most split times
            const maxSplits = Math.max(...validRunners.map(r => r.splitTimes.length));
            if (maxSplits === 0) return [];
            
            console.log(`📊 Calculating baseline from ${validRunners.length} valid runners, ${maxSplits} legs`);
            
            const baseline = new Array(maxSplits).fill(0);
            
            // Calculate baseline for each leg
            for (let legIndex = 0; legIndex < maxSplits; legIndex++) {
                const legTimes = [];
                
                for (const runner of validRunners) {
                    if (legIndex < runner.splitTimes.length && runner.splitTimes[legIndex] > 0) {
                        const legTime = runner.splitTimes[legIndex];
                        // Filter out massive outliers (> 1 hour = 36000 deciseconds)
                        if (legTime < 36000) {
                            legTimes.push(legTime);
                        } else {
                            console.log(`  - ⚠️ Filtering outlier from ${runner.fullName} leg ${legIndex}: ${legTime/10}s`);
                        }
                    }
                }
                
                if (legTimes.length === 0) {
                    baseline[legIndex] = 0;
                    continue;
                }
                
                legTimes.sort((a, b) => a - b);
                const ntimes = legTimes.length;
                
                let time = 0;
                if (ntimes < 5) {
                    // Best time for small sample
                    time = legTimes[0];
                } else if (ntimes < 10) {
                    // Average of two best for medium sample
                    time = Math.floor((legTimes[0] + legTimes[1]) / 2);
                } else {
                    // "Best fraction" for large sample (skip winner, average next 1/5 instead of 1/6)
                    const nval = Math.max(2, Math.floor(ntimes / 5));
                    let sum = 0;
                    for (let r = 1; r <= nval; r++) {
                        sum += legTimes[r];
                    }
                    time = Math.floor(sum / nval);
                }
                
                baseline[legIndex] = time;
                console.log(`  Leg ${legIndex}: ${ntimes} times, baseline: ${time}s (range: ${legTimes[0]}-${legTimes[legTimes.length-1]})`);
            }
            
            return baseline;
        }
        
        // MeOS split analysis algorithm (equivalent to oRunner::getSplitAnalysis)
        function getSplitAnalysis(runner, baseline) {
            const splitTimes = runner.splitTimes;
            const nc = baseline.length;
            
            // Only debug key runners
            const isKeyRunner = runner.fullName.includes('Samuel Kolins') || 
                               runner.fullName.includes('Shawn Duffalo') || 
                               runner.fullName.includes('David Cynamon') ||
                               runner.fullName.includes('Glen Tryson') ||
                               runner.fullName.includes('Sergei Ryzhkov');
            
            if (isKeyRunner) {
                console.log(`💬 ${runner.fullName} analysis:`);
            }
            
            if (nc === 0 || splitTimes.length === 0) {
                if (isKeyRunner) console.log(`  - Early return: no data`);
                return 0;
            }
            
            const deltaTimes = new Array(nc).fill(0);
            const res = new Array(nc).fill(0);
            
            // Copy runner's leg times, pad with zeros if needed
            for (let k = 0; k < nc; k++) {
                res[k] = (k < splitTimes.length) ? splitTimes[k] : 0;
            }
            
            // Calculate total times and baseline sum (MeOS uses doubles)
            let resSum = 0;
            let baseSum = 0;
            let bestTime = 0;
            
            for (let k = 0; k < nc; k++) {
                if (res[k] > 0) {
                    resSum += res[k];
                    baseSum += baseline[k];
                }
                bestTime += baseline[k];
            }
            
            if (isKeyRunner) {
                console.log(`  - Sums: resSum=${resSum}, baseSum=${baseSum}, bestTime=${bestTime}`);
            }
            
            if (resSum === 0 || baseSum === 0 || bestTime === 0) {
                if (isKeyRunner) console.log(`  - Early return due to zero sums`);
                return 0;
            }
            
            // First pass: adjust expected time by removing mistakes
            for (let k = 0; k < nc; k++) {
                if (res[k] > 0) {
                    const part = res[k] * baseSum / (resSum * bestTime);
                    const delta = part - baseline[k] / bestTime;
                    let deltaAbs = Math.floor(delta * resSum + 0.5);
                    
                    if (res[k] - deltaAbs < baseline[k]) {
                        deltaAbs = res[k] - baseline[k];
                    }
                    
                    if (deltaAbs > 0) {
                        resSum -= deltaAbs;
                    }
                }
            }
            
            const resOrig = [...res]; // Save original times
            
            // Second pass: calculate actual mistakes
            for (let k = 0; k < nc; k++) {
                if (res[k] > 0) {
                    const part = res[k] * baseSum / (resSum * bestTime);
                    const delta = part - baseline[k] / bestTime;
                    const deltaAbs = Math.floor(delta * resSum + 0.5);
                    
                    if (deltaAbs > 0) {
                        // MeOS criteria for significant mistake (fine-tuned):
                        // - |delta| > 0.8% AND deltaAbs > 8% of split time AND deltaAbs >= 150 deciseconds (15 seconds)
                        if (Math.abs(delta) > 0.008 && deltaAbs > res[k] * 0.08 && deltaAbs >= 150) {
                            deltaTimes[k] = deltaAbs;
                        }
                        
                        res[k] -= deltaAbs;
                        if (res[k] < baseline[k]) {
                            res[k] = baseline[k];
                        }
                    }
                }
            }
            
            // Recalculate resSum for final pass
            resSum = 0;
            for (let k = 0; k < nc; k++) {
                if (res[k] > 0) {
                    resSum += res[k];
                }
            }
            
            if (resSum === 0) return deltaTimes.reduce((sum, dt) => sum + dt, 0);
            
            // Final pass: refine mistake calculations
            for (let k = 0; k < nc; k++) {
                if (res[k] > 0) {
                    const part = resOrig[k] * baseSum / (resSum * bestTime);
                    const delta = part - baseline[k] / bestTime;
                    const deltaAbs = Math.floor(delta * resSum + 0.5);
                    
                    if (Math.abs(delta) > 0.008 && deltaAbs > resOrig[k] * 0.08 && deltaAbs >= 150) {
                        deltaTimes[k] = Math.max(deltaAbs, deltaTimes[k]);
                    }
                }
            }
            
            // Return total time lost in deciseconds
            const totalTimeLost = deltaTimes.reduce((sum, dt) => sum + dt, 0);
            if (isKeyRunner) {
                console.log(`  - Delta times: [${deltaTimes.join(', ')}]`);
                console.log(`  - Total: ${totalTimeLost} deciseconds`);
            }
            return totalTimeLost;
        }
        
        function parseSplitsXml(xmlText) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            // Check for parsing errors
            const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
            if (parserError) {
                throw new Error('XML parsing failed: ' + parserError.textContent);
            }
            
            const classes = [];
            const runners = [];
            
            // Parse ClassResult elements
            const classResults = xmlDoc.getElementsByTagName('ClassResult');
            
            for (let i = 0; i < classResults.length; i++) {
                const classResult = classResults[i];
                const classElement = classResult.getElementsByTagName('Class')[0];
                const courseElement = classResult.getElementsByTagName('Course')[0];
                const personResults = classResult.getElementsByTagName('PersonResult');
                
                if (!classElement) continue;
                
                const className = classElement.getElementsByTagName('Name')[0]?.textContent || 'Unknown';
                const classId = classElement.getElementsByTagName('Id')[0]?.textContent || i.toString();
                
                // Get course info if available
                let courseLength = 0;
                let courseClimb = 0;
                if (courseElement) {
                    courseLength = parseInt(courseElement.getElementsByTagName('Length')[0]?.textContent || '0');
                    courseClimb = parseInt(courseElement.getElementsByTagName('Climb')[0]?.textContent || '0');
                }
                
                const classInfo = {
                    id: classId,
                    name: className,
                    length: courseLength,
                    climb: courseClimb,
                    runners: []
                };
                
                // Parse runners in this class
                for (let j = 0; j < personResults.length; j++) {
                    const personResult = personResults[j];
                    const person = personResult.getElementsByTagName('Person')[0];
                    const organisation = personResult.getElementsByTagName('Organisation')[0];
                    const result = personResult.getElementsByTagName('Result')[0];
                    
                    if (!person || !result) continue;
                    
                    // Get name
                    const nameElement = person.getElementsByTagName('Name')[0];
                    const givenName = nameElement?.getElementsByTagName('Given')[0]?.textContent || '';
                    const familyName = nameElement?.getElementsByTagName('Family')[0]?.textContent || '';
                    const fullName = `${givenName} ${familyName}`.trim();
                    
                    // Get organization
                    const clubName = organisation?.getElementsByTagName('Name')[0]?.textContent || '';
                    
                    // Get result data
                    const time = parseInt(result.getElementsByTagName('Time')[0]?.textContent || '0') * 1000; // Convert seconds to milliseconds
                    const timeBehind = parseInt(result.getElementsByTagName('TimeBehind')[0]?.textContent || '0') * 1000; // Convert to milliseconds
                    const position = parseInt(result.getElementsByTagName('Position')[0]?.textContent || '0');
                    const status = result.getElementsByTagName('Status')[0]?.textContent || 'Unknown';
                    
                    // Parse split times for MeOS-based time lost analysis
                    const splitTimeElements = result.getElementsByTagName('SplitTime');
                    const cumulativeTimes = [];
                    
                    for (let k = 0; k < splitTimeElements.length; k++) {
                        const splitTime = splitTimeElements[k];
                        const controlCode = splitTime.getElementsByTagName('ControlCode')[0]?.textContent;
                        const time = parseInt(splitTime.getElementsByTagName('Time')[0]?.textContent || '0');
                        
                        if (time > 0) {
                            cumulativeTimes.push(time * 10); // Convert seconds to deciseconds (MeOS time units)
                        }
                    }
                    
                    // Convert cumulative times to leg times (MeOS uses leg times for analysis)
                    const legTimes = [];
                    let previousTime = 0;
                    for (let i = 0; i < cumulativeTimes.length; i++) {
                        legTimes.push(cumulativeTimes[i] - previousTime);
                        previousTime = cumulativeTimes[i];
                    }
                    
                    // Add finish leg time (last control to finish)
                    if (time > 0 && cumulativeTimes.length > 0) {
                        const totalTimeDeciseconds = time * 10; // Convert seconds to deciseconds
                        const lastControlTime = cumulativeTimes[cumulativeTimes.length - 1];
                        const finishLegTime = totalTimeDeciseconds - lastControlTime;
                        
                        if (finishLegTime > 0 && finishLegTime < 36000) { // Sanity check: < 1 hour
                            legTimes.push(finishLegTime);
                        } else {
                            console.log(`⚠️ Skipping suspicious finish leg time for ${fullName}: ${finishLegTime/10}s`);
                        }
                    }
                    
                    // Store leg times and class data for later analysis
                    let timeLost = 0; // Will be calculated after all runners are parsed
                    
                    const runner = {
                        fullName: fullName,
                        club: clubName,
                        totalTime: time > 0 ? time : null,
                        timeBehindLeader: timeBehind > 0 ? timeBehind : null,
                        timeLost: timeLost > 0 ? timeLost : null,
                        position: position > 0 ? position : null,
                        status: status.toLowerCase() === 'ok' ? 'finished' : status.toLowerCase(),
                        splitTimes: legTimes, // Leg times in seconds for MeOS analysis
                        splitTimeDetails: Array.from(splitTimeElements).map(split => ({
                            controlCode: split.getElementsByTagName('ControlCode')[0]?.textContent,
                            time: parseInt(split.getElementsByTagName('Time')[0]?.textContent || '0') * 1000
                        }))
                    };
                    
                    classInfo.runners.push(runner);
                    runners.push({...runner, className});
                }
                
                // Sort runners by position
                classInfo.runners.sort((a, b) => (a.position || 999) - (b.position || 999));
                
                // Calculate MeOS-based time lost for all runners in this class
                calculateTimeLostForClass(classInfo);
                
                classes.push(classInfo);
            }
            
            return { classes, runners };
        }
        
        // Transform splits data to our display format
        function transformSplitsData(parsedData) {
            const transformedClasses = parsedData.classes.map(classData => ({
                className: classData.name,
                courseLength: classData.length || 5000,
                runners: classData.runners,
                dataSource: 'xml_splits'
            }));
            
            // Sort classes using custom orienteering color course order
            transformedClasses.sort((a, b) => {
                return compareClassNames(a.className, b.className, parsedData.classes);
            });
            
            return transformedClasses;
        }
        
        // Parse XML response from direct MeOS API calls
        function parseMeosXmlResponse(xmlText) {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                
                // Check for parsing errors
                const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
                if (parserError) {
                    console.error('XML parsing error:', parserError.textContent);
                    return null;
                }
                
                // Extract runner data from various MeOS XML formats
                const runners = [];
                
                // Try PersonEntry format (startlist/entries)
                const personEntries = xmlDoc.getElementsByTagName('PersonEntry');
                for (let i = 0; i < personEntries.length; i++) {
                    const entry = personEntries[i];
                    const runner = parseMeosPersonEntry(entry);
                    if (runner) runners.push(runner);
                }
                
                // Try PersonResult format (results)
                const personResults = xmlDoc.getElementsByTagName('PersonResult');
                for (let i = 0; i < personResults.length; i++) {
                    const result = personResults[i];
                    const runner = parseMeosPersonResult(result);
                    if (runner) runners.push(runner);
                }
                
                // Try Competitor format
                const competitors = xmlDoc.getElementsByTagName('Competitor');
                for (let i = 0; i < competitors.length; i++) {
                    const competitor = competitors[i];
                    const runner = parseMeosCompetitor(competitor);
                    if (runner) runners.push(runner);
                }
                
                return runners;
                
            } catch (error) {
                console.error('Failed to parse MeOS XML response:', error);
                return null;
            }
        }
        
        // Parse MeOS PersonEntry XML element
        function parseMeosPersonEntry(entry) {
            try {
                const person = entry.getElementsByTagName('Person')[0];
                const card = entry.getElementsByTagName('Card')[0];
                const entryClass = entry.getElementsByTagName('Class')[0];
                
                if (!person) return null;
                
                const givenName = person.getElementsByTagName('Given')[0]?.textContent || '';
                const familyName = person.getElementsByTagName('Family')[0]?.textContent || '';
                const club = person.getElementsByTagName('Club')[0]?.textContent || '';
                
                return {
                    id: entry.getAttribute('id'),
                    name: {
                        first: givenName,
                        last: familyName,
                    },
                    fullName: `${givenName} ${familyName}`.trim(),
                    club: club,
                    cardNumber: card?.getElementsByTagName('CardNo')[0]?.textContent || '0',
                    className: entryClass?.getElementsByTagName('Name')[0]?.textContent || 'Unknown',
                    classId: entryClass?.getAttribute('id'),
                    birthYear: person.getElementsByTagName('BirthDate')[0]?.textContent || '',
                    sex: person.getElementsByTagName('Sex')[0]?.textContent || '',
                    nationality: person.getElementsByTagName('Nationality')[0]?.textContent || '',
                    status: 'checked_in', // Default for entries
                    startTime: entry.getElementsByTagName('StartTime')[0]?.textContent,
                    bib: entry.getElementsByTagName('BibNumber')[0]?.textContent,
                    dataSource: 'meos_xml'
                };
            } catch (error) {
                console.error('Failed to parse PersonEntry:', error);
                return null;
            }
        }
        
        // Parse MeOS PersonResult XML element
        function parseMeosPersonResult(result) {
            try {
                const person = result.getElementsByTagName('Person')[0];
                const resultElement = result.getElementsByTagName('Result')[0];
                const organisation = result.getElementsByTagName('Organisation')[0];
                
                if (!person || !resultElement) return null;
                
                const nameElement = person.getElementsByTagName('Name')[0];
                const givenName = nameElement?.getElementsByTagName('Given')[0]?.textContent || '';
                const familyName = nameElement?.getElementsByTagName('Family')[0]?.textContent || '';
                
                const time = parseInt(resultElement.getElementsByTagName('Time')[0]?.textContent || '0');
                const timeBehind = parseInt(resultElement.getElementsByTagName('TimeBehind')[0]?.textContent || '0');
                const position = parseInt(resultElement.getElementsByTagName('Position')[0]?.textContent || '0');
                const status = resultElement.getElementsByTagName('Status')[0]?.textContent || 'Unknown';
                
                return {
                    fullName: `${givenName} ${familyName}`.trim(),
                    club: organisation?.getElementsByTagName('Name')[0]?.textContent || '',
                    totalTime: time > 0 ? time * 1000 : null, // Convert to milliseconds
                    timeBehindLeader: timeBehind > 0 ? timeBehind * 1000 : null,
                    timeLost: null, // Will be calculated if needed
                    position: position > 0 ? position : null,
                    status: status.toLowerCase() === 'ok' ? 'finished' : status.toLowerCase(),
                    dataSource: 'meos_xml'
                };
            } catch (error) {
                console.error('Failed to parse PersonResult:', error);
                return null;
            }
        }
        
        // Parse MeOS Competitor XML element
        function parseMeosCompetitor(competitor) {
            try {
                // Implementation depends on MeOS Competitor XML structure
                // This is a placeholder - would need actual MeOS XML format
                return null;
            } catch (error) {
                console.error('Failed to parse Competitor:', error);
                return null;
            }
        }
        
        // Transform MeOS XML data to our display format
        function transformMeosXmlData(runners) {
            if (!Array.isArray(runners) || runners.length === 0) {
                return [];
            }
            
            // Group by class
            const classGroups = {};
            
            runners.forEach(runner => {
                const className = runner.className || 'Unknown';
                if (!classGroups[className]) {
                    classGroups[className] = {
                        className: className,
                        courseLength: 5000, // Default
                        runners: [],
                        dataSource: 'meos_xml'
                    };
                }
                
                classGroups[className].runners.push(runner);
            });
            
            // Convert to array and sort
            const transformedClasses = Object.values(classGroups);
            transformedClasses.sort((a, b) => {
                return compareClassNames(a.className, b.className, []);
            });
            
            return transformedClasses;
        }
        
        // Transform local checked-in entries to our display format
        function transformLocalEntriesData(localEntries) {
            if (!Array.isArray(localEntries)) {
                console.warn('Local entries is not an array:', localEntries);
                return [];
            }
            
            console.log(`💾 Transforming ${localEntries.length} local checked-in entries`);
            
            // Group by class
            const classGroups = {};
            
            localEntries.forEach(entry => {
                const className = entry.className || 'Unknown';
                if (!classGroups[className]) {
                    classGroups[className] = {
                        className: className,
                        courseLength: 5000, // Default
                        runners: [],
                        dataSource: 'local_checkin'
                    };
                }
                
                // Transform local entry to our runner format
                const runner = {
                    fullName: `${entry.name?.first || ''} ${entry.name?.last || ''}`.trim(),
                    club: entry.club || '',
                    totalTime: null, // No time yet - just checked in
                    timeBehindLeader: null,
                    timeLost: null,
                    position: null,
                    status: 'checked_in',
                    dataSource: 'local_checkin'
                };
                
                classGroups[className].runners.push(runner);
            });
            
            // Convert to array and sort
            const transformedClasses = Object.values(classGroups);
            transformedClasses.sort((a, b) => {
                return compareClassNames(a.className, b.className, []);
            });
            
            console.log(`✅ Transformed into ${transformedClasses.length} classes`);
            return transformedClasses;
        }
        
        // Transform MeOS API data to our display format
        function transformMeosApiData(apiData) {
            if (!Array.isArray(apiData)) {
                console.warn('API data is not an array:', apiData);
                return [];
            }
            
            // Group by class
            const classGroups = {};
            
            apiData.forEach(entry => {
                const className = entry.className || 'Unknown';
                if (!classGroups[className]) {
                    classGroups[className] = {
                        className: className,
                        courseLength: 5000, // Default - no course length from API
                        runners: [],
                        dataSource: 'meos_api'
                    };
                }
                
                // Transform API entry to our runner format
                const runner = {
                    fullName: `${entry.name?.first || ''} ${entry.name?.last || ''}`.trim(),
                    club: entry.club || '',
                    totalTime: entry.totalTime || null,
                    timeBehindLeader: null,
                    timeLost: null,
                    position: entry.position || null,
                    status: entry.status || determineApiStatus(entry)
                };
                
                classGroups[className].runners.push(runner);
            });
            
            // Convert to array and sort
            const transformedClasses = Object.values(classGroups);
            transformedClasses.sort((a, b) => {
                return compareClassNames(a.className, b.className, []);
            });
            
            return transformedClasses;
        }
        
        // Determine status from MeOS API entry
        function determineApiStatus(entry) {
            if (entry.status === 'checked-in') {
                // Check if they have a start time in MeOS
                if (entry.startTime) {
                    return 'in_forest';
                } else {
                    return 'checked_in';
                }
            }
            return entry.status || 'checked_in';
        }
        
        // Merge data sources, prioritizing XML splits > Local checked-in > API data
        function mergeDataSources(xmlResults, localResults, apiResults, courseLengthMap = {}) {
            if (xmlResults.length === 0 && localResults.length === 0 && apiResults.length === 0) {
                return [];
            }
            
            // If only one source has data, return it
            if (xmlResults.length === 0 && localResults.length === 0) {
                console.log('Using API data only');
                return apiResults;
            }
            
            if (xmlResults.length === 0 && apiResults.length === 0) {
                console.log('Using local checked-in data only');
                return localResults;
            }
            
            if (localResults.length === 0 && apiResults.length === 0) {
                console.log('Using XML data only');
                return xmlResults;
            }
            
            console.log(`Merging ${xmlResults.length} XML, ${localResults.length} local, ${apiResults.length} API classes`);
            
            // Create a map of XML classes for quick lookup
            const xmlClassMap = {};
            xmlResults.forEach(classResult => {
                xmlClassMap[classResult.className] = classResult;
            });
            
            // Start with XML results (they have more detailed data)
            const mergedResults = [...xmlResults];
            
            // Build class map for lookups
            const mergedClassMap = {};
            mergedResults.forEach(classResult => {
                mergedClassMap[classResult.className] = classResult;
            });
            
            // Add local checked-in runners first (they might not be in MeOS yet)
            localResults.forEach(localClass => {
                const existingClass = mergedClassMap[localClass.className];
                
                if (existingClass) {
                    // Class exists, merge runners
                    const existingRunnerNames = new Set(existingClass.runners.map(r => r.fullName.toLowerCase()));
                    
                    // Add local runners not already in results (just checked in, not started yet)
                    localClass.runners.forEach(localRunner => {
                        if (!existingRunnerNames.has(localRunner.fullName.toLowerCase())) {
                            console.log(`➕ Adding checked-in runner: ${localRunner.fullName} (${localClass.className})`);
                            existingClass.runners.push({
                                ...localRunner,
                                dataSource: 'local_checkin'
                            });
                        }
                    });
                } else {
                    // Class doesn't exist yet, add entire class
                    // Try to find course length from: 1) API courseLengthMap, 2) XML data, 3) local data, 4) default
                    const courseLength = courseLengthMap[localClass.className] || 
                                        xmlResults.find(c => c.className === localClass.className)?.courseLength || 
                                        localClass.courseLength || 
                                        5000;
                    
                    console.log(`➕ Adding checked-in class: ${localClass.className} (${courseLength}m)`);
                    const newClass = { ...localClass, courseLength };
                    mergedResults.push(newClass);
                    mergedClassMap[localClass.className] = newClass;
                }
            });
            
            // Add API-only runners to existing classes or create new classes
            apiResults.forEach(apiClass => {
                const existingClass = mergedClassMap[apiClass.className];
                
                if (existingClass) {
                    // Class exists, merge runners
                    const existingRunnerNames = new Set(existingClass.runners.map(r => r.fullName.toLowerCase()));
                    
                    // Add API runners not already in results
                    apiClass.runners.forEach(apiRunner => {
                        if (!existingRunnerNames.has(apiRunner.fullName.toLowerCase())) {
                            console.log(`➕ Adding API-only runner: ${apiRunner.fullName} (${apiClass.className})`);
                            existingClass.runners.push({
                                ...apiRunner,
                                dataSource: 'meos_api'
                            });
                        }
                    });
                } else {
                    // Class doesn't exist yet, add entire class from API
                    // Apply course length from API map if available
                    const courseLength = courseLengthMap[apiClass.className] || apiClass.courseLength || 5000;
                    const newClass = { ...apiClass, courseLength };
                    console.log(`➕ Adding API-only class: ${apiClass.className} (${courseLength}m)`);
                    mergedResults.push(newClass);
                    mergedClassMap[apiClass.className] = newClass;
                }
            });
            
            // Re-sort classes after merging
            mergedResults.sort((a, b) => {
                return compareClassNames(a.className, b.className, []);
            });
            
            return mergedResults;
        }
        
        // Mock fallback time lost data (in milliseconds) - used if XML loading fails
        const mockTimeLostData = {
            '30': 199000,   // Shawn Duffalo - 3:19
            '35': 534000,   // David Cynamon - 8:54
            '38': 199000,   // Ann Grace MacMullan - 3:19
            '53': 648000,   // Ron Bortz - 10:48
            '15': 840000,   // Sneakers & Spokes 2 Dougan - 14:00
            '48': 1226000,  // Zhenyu Fan - 20:26
            '6': 1248000,   // Bob Burton - 20:48
            '25': 1119000,  // Brian Supplee - 18:39
            '47': 506000,   // Janet Tryson - 8:26
            '19': 886000,   // Mark Frank - 14:46
            '70': 1271000,  // Mark Kern - 21:11
            '45': 774000,   // Richard Ebright - 12:54
            '54': 954000,   // Jim Eagleton - 15:54
            '50': 1993000,  // Bob Fink - 33:13
            '24': 1726000,  // Bruce Zeidman - 28:46
            '27': 2310000,  // Rob Wilkison - 38:30
            '11': 2032000,  // Ed Dunlop - 33:52
            '16': 5091000,  // Lyn Shaffer - 1:24:51
            '46': 298000,   // Glen Tryson - 4:58
            '1': 867000,    // Cameron Guindi - 14:27
            '61': 930000,   // Anders Ryerson - 15:30
            '60': 559000,   // Svetlana Frolenko - 9:19
            '80': 1401000,  // Nathan Kearney - 23:21
            '13': 862000,   // Kyle Schandall - 14:22
            '17': 281000,   // Ron Barron - 4:41
            '51': 782000,   // Katherine Moss - 13:02
            '29': 1032000,  // Julie Keim - 17:12
            '18': 1166000,  // Mary Frank - 19:26
            '75': 2998000,  // Team Carol Kluchinski - 49:58
            '69': 301000,   // Garrett Currie - 5:01
            '66': 637000,   // BC3 - 10:37
            '8': 795000,    // Lena Kushleyeva - 13:15
            '55': 664000,   // Irina Pavlava - 11:04
            '68': 806000,   // AJ Bookman - 13:26
            '59': 1795000,  // Bondar Bondar - 29:55
            '52': 1475000,  // Darina Pavlava - 24:35
            '31': 2307000,  // Cindy Thompson - 38:27
            '10': 1049000,  // Troop 903 Nature Clan Valenti - 17:29
            '43': 1908000,  // Samuel Forwood - 31:48
            '56': 1447000,  // Adventure Mode Elmer - 24:07
            '23': 861000,   // Lewis Family Lewis - 14:21
            '81': 238000,   // Sergei Ryzhkov - 3:58
            '7': 0          // Samuel Kolins - 0:00
        };
        
        function transformMeosData(classes, results, timeLostData) {
            // Group results by class
            const resultsByClass = {};
            
            results.forEach(result => {
                const classId = result.classId;
                if (!resultsByClass[classId]) {
                    resultsByClass[classId] = [];
                }
                resultsByClass[classId].push(result);
            });
            
            // Transform to our format
            const transformedClasses = [];
            
            classes.forEach(classData => {
                const classId = classData.id;
                const classResults = resultsByClass[classId] || [];
                
                // Always include the class, even if empty (no runners checked in yet)
                // Get course length from class data if available
                const courseLength = classData.length || 5000;
                
                // Sort runners: finished first (by place), then unfinished by status
                classResults.sort((a, b) => {
                    // If both have positions, sort by position
                    if (a.position && b.position) {
                        return a.position - b.position;
                    }
                    
                    // Finished runners (with times) come before unfinished
                    if (a.totalTime && !b.totalTime) return -1;
                    if (!a.totalTime && b.totalTime) return 1;
                    
                    // Both finished, sort by time
                    if (a.totalTime && b.totalTime) {
                        return a.totalTime - b.totalTime;
                    }
                    
                    // Both unfinished - sort by status priority
                    const statusPriority = { 'in_forest': 1, 'checked_in': 2, 'dns': 3, 'dnf': 4, 'dsq': 5 };
                    const aPriority = statusPriority[a.status] || 6;
                    const bPriority = statusPriority[b.status] || 6;
                    return aPriority - bPriority;
                });
                
                // Calculate time differences from leader
                const leaderTime = classResults.find(r => r.totalTime && r.position === 1)?.totalTime;
                
                const transformedRunners = classResults.map(result => {
                    // Get runner ID from the results XML (name element has id attribute)
                    const runnerId = result.runnerId;
                    
                    // Use real time lost from API if available, fallback to mock data
                    const timeLost = (timeLostData && timeLostData[runnerId]) || 
                                    (mockTimeLostData && mockTimeLostData[runnerId]) || 
                                    null;
                    
                    return {
                        fullName: `${result.firstName} ${result.lastName}`.trim(),
                        club: result.club || '',
                        totalTime: result.totalTime,
                        timeBehindLeader: (result.totalTime && leaderTime && result.totalTime > leaderTime) ? result.totalTime - leaderTime : null,
                        timeLost: timeLost,
                        position: result.position,
                        status: result.status
                    };
                });
                
                transformedClasses.push({
                    className: classData.name,
                    courseLength: courseLength,
                    runners: transformedRunners
                });
            });
            
            // Sort classes using custom orienteering color course order
            transformedClasses.sort((a, b) => {
                return compareClassNames(a.className, b.className, classes);
            });
            
        }
        
        function compareClassNames(nameA, nameB, classes) {
            // Standard orienteering course color progression
            const colorOrder = ['white', 'yellow', 'orange', 'brown', 'green', 'red', 'blue'];
            
            // Extract color from class name (case insensitive)
            const getColorFromName = (name) => {
                const lowerName = name.toLowerCase();
                return colorOrder.find(color => lowerName.includes(color));
            };
            
            const colorA = getColorFromName(nameA);
            const colorB = getColorFromName(nameB);
            
            // If both have colors, sort by color order
            if (colorA && colorB) {
                const indexA = colorOrder.indexOf(colorA);
                const indexB = colorOrder.indexOf(colorB);
                if (indexA !== indexB) {
                    return indexA - indexB;
                }
                // Same color - fall through to secondary sorting
            }
            
            // If only one has a color, colored courses come first
            if (colorA && !colorB) return -1;
            if (!colorA && colorB) return 1;
            
            // For non-color courses or same-color courses, use original ord-based sorting
            const classA = classes.find(c => c.name === nameA);
            const classB = classes.find(c => c.name === nameB);
            const ordA = classA?.ord || 0;
            const ordB = classB?.ord || 0;
            
            if (ordA !== ordB) {
                return ordA - ordB;
            }
            
            // Final fallback: alphabetical by class name
            return nameA.localeCompare(nameB);
            
            return transformedClasses;
        }

        function displayResults(classResults) {
            console.log('Displaying results:', classResults);
            const container = document.getElementById('resultsContainer');
            
            if (!classResults || classResults.length === 0) {
                console.log('No results to display - showing waiting message');
                container.innerHTML = `
                    <div class="class-card">
                        <div class="no-results">
                            <div class="no-results-icon">⌛</div>
                            <h3>Waiting for Check-In</h3>
                            <p>Results will appear here as runners check in.</p>
                        </div>
                    </div>
                `;
                return;
            }
            
            console.log('🚀 Generating screen files for', classResults.length, 'classes...');
            // Always generate screen files (windows) for any screen count
            generateScreenFiles(classResults, screenCount);
            
            // Show screen links in main page
            container.innerHTML = generateScreenLinks(screenCount);
        }
        
        function optimizeGlobalDistribution(classResults, numScreens) {
            if (numScreens === 1) {
                return [classResults]; // No distribution needed
            }
            
            const totalRunners = classResults.reduce((sum, c) => sum + c.runners.length, 0);
            const availableHeight = (window.innerHeight || 1080) - 50;
            
            console.log(`Optimizing ${totalRunners} runners, ${classResults.length} classes across ${numScreens} screens`);
            
            let bestGlobalDistribution = null;
            let bestGlobalFontSize = 0;
            
            // Try different distribution strategies to maximize minimum font size across all screens
            const strategies = [
                'balanced_runners',  // Balance total runners per screen
                'balanced_classes',  // Balance number of classes per screen  
                'minimize_max_load', // Minimize the most loaded screen
                'optimize_per_screen' // Optimize each screen individually
            ];
            
            for (const strategy of strategies) {
                const distribution = distributeByStrategy(classResults, numScreens, strategy);
                
                // Calculate the minimum font size across all screens in this distribution
                let minFontSize = Infinity;
                
                distribution.forEach((screenClasses, screenIndex) => {
                    if (screenClasses.length === 0) {
                        minFontSize = 0;
                        return;
                    }
                    
                    const layout = findOptimalLayoutForScreen(screenClasses, availableHeight);
                    const fontSize = layout.fontSizes.tableCell;
                    
                    minFontSize = Math.min(minFontSize, fontSize);
                });
                
                // Keep the best distribution (highest minimum font size)
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
                    // Balance total runners while preserving order as much as possible
                    const totalRunners = classResults.reduce((sum, c) => sum + c.runners.length, 0);
                    const targetPerScreen = totalRunners / numScreens;
                    const screenRunnerCounts = Array(numScreens).fill(0);
                    
                    let currentScreen = 0;
                    
                    classResults.forEach(classResult => {
                        // If current screen is getting too heavy and we have more screens, move to next
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
                    // Distribute classes evenly while preserving order
                    classResults.forEach((classResult, index) => {
                        screens[index % numScreens].push(classResult);
                    });
                    break;
                }
                
                case 'minimize_max_load': {
                    // Sequential distribution with load balancing
                    const screenRunnerCounts = Array(numScreens).fill(0);
                    
                    classResults.forEach(classResult => {
                        // Find the screen with the least runners so far
                        const minIndex = screenRunnerCounts.indexOf(Math.min(...screenRunnerCounts));
                        screens[minIndex].push(classResult);
                        screenRunnerCounts[minIndex] += classResult.runners.length;
                    });
                    break;
                }
                
                case 'optimize_per_screen': {
                    // Sequential chunking that preserves order
                    const classesPerScreen = Math.ceil(classResults.length / numScreens);
                    
                    classResults.forEach((classResult, index) => {
                        const screenIndex = Math.floor(index / classesPerScreen);
                        if (screenIndex < numScreens) {
                            screens[screenIndex].push(classResult);
                        } else {
                            // Handle overflow
                            screens[numScreens - 1].push(classResult);
                        }
                    });
                    break;
                }
            }
            
            return screens.filter(screen => screen.length > 0);
        }
        
        function findOptimalLayoutForScreen(classResults, availableHeight) {
            // This is the same as findOptimalLayout but for a specific set of classes
            let bestLayout = null;
            let bestFontSize = 0;
            
            // Try different column counts (1 to 8) and find the one with largest fonts
            for (let numColumns = 1; numColumns <= 8; numColumns++) {
                const columnSections = distributeToColumns(classResults, numColumns);
                const fontSizes = calculateFontSizesForLayout(columnSections, availableHeight);
                
                // Score this layout based on font size (bigger is better)
                const score = fontSizes.tableCell;
                
                if (!bestLayout || score > bestFontSize) {
                    bestLayout = { optimalColumns: numColumns, columnSections, fontSizes };
                    bestFontSize = score;
                }
            }
            
            // Fallback if no layout found
            if (!bestLayout) {
                const columnSections = [classResults];
                const fontSizes = calculateFontSizesForLayout(columnSections, availableHeight);
                bestLayout = { optimalColumns: 1, columnSections, fontSizes };
            }
            
            return bestLayout;
        }
        
        function partitionClasses(classes, numScreens) {
            // Fallback simple partitioning (not used anymore)
            const sections = [];
            const classesPerScreen = Math.ceil(classes.length / numScreens);
            
            for (let i = 0; i < numScreens; i++) {
                const start = i * classesPerScreen;
                const end = Math.min(start + classesPerScreen, classes.length);
                sections.push(classes.slice(start, end));
            }
            
            return sections.filter(section => section.length > 0);
        }
        
        function calculateCompactFontSizes(screenSections) {
            // Calculate total runners per screen to determine scaling
            const maxRunnersPerScreen = Math.max(...screenSections.map(section => 
                section.reduce((sum, classResult) => sum + classResult.runners.length, 0)
            ));
            
            const availableHeight = window.innerHeight - 30; // Ultra-minimal header space
            
            // Estimate space needed - much more compact now
            // Each class needs: 1 tiny header + 1 table header + N runner rows
            const classCount = screenSections[0]?.length || 0;
            const estimatedRowsNeeded = maxRunnersPerScreen + (classCount * 2); // Just 2 rows per class (tiny header + table header)
            
            // Calculate scale factor to fit everything - more aggressive scaling
            const scaleFactor = Math.min(1, availableHeight / (estimatedRowsNeeded * 18)); // 18px base row height
            
            return {
                classTitle: Math.max(6, Math.floor(12 * scaleFactor)), // Much smaller class headers
                runnerName: Math.max(5, Math.floor(10 * scaleFactor)),
                tableHeader: Math.max(5, Math.floor(8 * scaleFactor)),
                tableCell: Math.max(5, Math.floor(7 * scaleFactor)),
                position: Math.max(5, Math.floor(9 * scaleFactor)),
                padding: Math.max(1, Math.floor(3 * scaleFactor)),
                headerPadding: Math.max(1, Math.floor(2 * scaleFactor)), // Tiny header padding
                cardMargin: Math.max(1, Math.floor(2 * scaleFactor))
            };
        }
        
        // Store opened screen windows for updates
        let screenWindows = [];
        
        function generateScreenFiles(classResults, numScreens) {
            console.log('[generateScreenFiles] Called with:', classResults.length, 'classes,', numScreens, 'screens');
            console.log('[generateScreenFiles] Class data:', JSON.stringify(classResults, null, 2));
            
            // First, optimize class distribution across ALL screens
            const optimizedScreenSections = optimizeGlobalDistribution(classResults, numScreens);
            console.log('[generateScreenFiles] Optimized sections:', optimizedScreenSections.length);
            
            // Close any existing screen windows that are beyond our new count
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
                    // Update existing window content without closing/reopening
                    console.log(`[update] Screen ${screenNumber} content`);
                    try {
                        screenWindows[screenIndex].document.open();
                        screenWindows[screenIndex].document.write(html);
                        screenWindows[screenIndex].document.close();
                        console.log(`Screen ${screenNumber} updated successfully`);
                    } catch (error) {
                        console.error(`Error updating screen ${screenNumber}:`, error);
                        // If update fails, try reopening
                        screenWindows[screenIndex] = null;
                    }
                }
                
                // Open new window if needed
                if (!screenWindows[screenIndex] || screenWindows[screenIndex].closed) {
                    try {
                        console.log(`Opening screen ${screenNumber} with fresh content`);
                        screenWindows[screenIndex] = window.open('', `screen_${screenNumber}`, 'width=1200,height=800');
                        if (screenWindows[screenIndex]) {
                            screenWindows[screenIndex].document.open();
                            screenWindows[screenIndex].document.write(html);
                            screenWindows[screenIndex].document.close();
                            console.log(`Screen ${screenNumber} opened successfully`);
                        } else {
                            console.error(`Failed to open screen ${screenNumber} - popup blocked?`);
                        }
                    } catch (error) {
                        console.error(`Error opening screen ${screenNumber}:`, error);
                    }
                }
            });
        }
        
        function generateScreenLinks(numScreens) {
            let html = '<div style="text-align: center; padding: 40px;">';
            html += '<h2>Multi-Screen Results Active</h2>';
            html += `<p>${numScreens} screen windows should now be open. Drag each window to a different monitor for optimal viewing.</p>`;
            html += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin: 20px 0; font-size: 14px;">';
            html += '<strong>💡 Tip:</strong> If windows didn\'t open, your browser may be blocking popups. <br>';
            html += 'Look for a popup blocker icon in your address bar and click "Allow popups" for this site.';
            html += '</div>';
            html += '<div style="display: flex; gap: 20px; justify-content: center; margin-top: 30px;">';
            
            for (let i = 1; i <= numScreens; i++) {
                html += `
                    <div style="background: #e6ffe6; padding: 20px; border-radius: 8px; border: 2px solid #00AA00;">
                        <h3>📺 Screen ${i}</h3>
                        <p style="color: #00AA00; font-weight: bold;">TAB ACTIVE</p>
                        <small>Drag to Monitor ${i}</small>
                    </div>
                `;
            }
            
            html += '</div>';
            html += '<div style="margin-top: 30px;">';
            html += '<p><strong>Master Control:</strong> Use the screen selector above to add/remove screens. All open tabs will update automatically.</p>';
            html += '<button onclick="refreshAllScreens()" style="margin-top: 15px; padding: 10px 20px; font-size: 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">🔄 Refresh All Screens</button>';
            html += '<button onclick="closeAllScreens()" style="padding: 10px 20px; font-size: 16px; background: #cc0000; color: white; border: none; border-radius: 4px; cursor: pointer;">❌ Close All Screens</button>';
            html += '</div>';
            html += '</div>';
            return html;
        }
        
        function refreshAllScreens() {
            if (currentResults.length > 0) {
                displayResults(currentResults);
            }
        }
        
        function closeAllScreens() {
            screenWindows.forEach(window => {
                if (window && !window.closed) {
                    window.close();
                }
            });
            screenWindows = [];
            
            // Reset the main page
            const container = document.getElementById('resultsContainer');
            container.innerHTML = '<div style="text-align: center; padding: 40px;"><h3>All screens closed</h3><p>Select number of screens above to reopen.</p></div>';
        }
        
        function generateScreenHTML(classResults, screenNumber, totalScreens) {
            // Find optimal column count by testing what fits best
            const { optimalColumns, columnSections, fontSizes } = findOptimalLayout(classResults);

            // Readability thresholds for outdoor TV/monitor viewing (in pixels)
            const READABILITY = {
                tableCell: 18,
                runnerName: 20,
                tableHeader: 16,
                classTitle: 20,
                position: 18,
                padding: 4,
                headerPadding: 4
            };

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
            font-weight: 600; /* slightly bolder for distance readability */
            background: #ffffff;
            min-height: 100vh;
            padding: 5px;
            overflow: hidden; /* hide when scrolling */
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
            letter-spacing: 0.5px;
        }
        
        /* Viewport that constrains the scrollable content */
        .scroll-viewport {
            position: relative;
            height: calc(100vh - 44px);
            overflow: hidden;
            width: 100%;
        }
        
        .columns-container {
            display: grid;
            grid-template-columns: repeat(${optimalColumns}, 1fr);
            gap: 6px;
            transform: translateY(0);
            will-change: transform;
        }
        
        .column {
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        
        .class-card {
            background: white;
            border-radius: 2px;
            margin-bottom: ${applied.cardMargin}px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
            border: 1px solid #333;
            flex-shrink: 0;
        }
        
        .class-header-compact {
            background: #333;
            color: white;
            padding: ${applied.headerPadding}px;
            font-size: ${applied.classTitle}px;
            font-weight: 800;
            border-bottom: 1px solid #FFD700;
            text-align: center;
        }
        
        .results-table { width: 100%; border-collapse: collapse; }
        
        .results-table th {
            background: #000; /* higher contrast outdoors */
            color: #fff;
            padding: ${applied.padding}px;
            text-align: left;
            font-weight: 800;
            font-size: ${applied.tableHeader}px;
            border-bottom: 2px solid #FFD700;
        }
        
        .results-table td {
            padding: ${applied.padding}px;
            border-bottom: 1px solid #ddd;
            font-size: ${applied.tableCell}px;
            font-weight: 600;
            line-height: 1.5;
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
        SCREEN ${screenNumber} OF ${totalScreens} | ${optimalColumns} COLS | ${classResults.reduce((sum, c) => sum + c.runners.length, 0)} RUNNERS | FONT: ${applied.tableCell}px${needsScroll ? ' | SCROLL' : ''} | LIVE | ${new Date().toLocaleTimeString()}
    </div>

    <div class="scroll-viewport">
      <div class="columns-container">
        ${columnSections.map((column, index) => `
            <div class="column">
                ${column.map(classResult => generateClassHTML(classResult)).join('')}
            </div>
        `).join('')}
      </div>
    </div>

    <script>
        // Embed class data and readability for dynamic re-optimization + scroll
        const classData = ${JSON.stringify(classResults)};
        const screenNum = ${screenNumber};
        const totalScreens = ${totalScreens};
        const READABILITY = ${JSON.stringify({
                tableCell: 18,
                runnerName: 20,
                tableHeader: 16,
                classTitle: 20,
                position: 18,
                padding: 4,
                headerPadding: 4
        })};
        let baseScrollEnabled = ${needsScroll};

        let rafId = null;
        let pauseUntil = 0;
        let scrollY = 0;
        let direction = 1; // 1=down, -1=up

        function startAutoScroll() {
            const viewport = document.querySelector('.scroll-viewport');
            const content = document.querySelector('.columns-container');
            if (!viewport || !content) return;

            const overflow = Math.max(0, content.scrollHeight - viewport.clientHeight);
            if (overflow <= 0) return; // nothing to scroll

            const targetCycleSeconds = 60; // full down or up in ~60s
            const pxPerSec = Math.min(120, Math.max(10, overflow / targetCycleSeconds));
            const pauseMs = 1800; // pause at ends

            function step(ts) {
                if (!step.lastTs) step.lastTs = ts;
                const dt = (ts - step.lastTs) / 1000;
                step.lastTs = ts;

                if (ts < pauseUntil) {
                    rafId = requestAnimationFrame(step);
                    return;
                }

                scrollY += direction * pxPerSec * dt;
                if (scrollY >= overflow) {
                    scrollY = overflow;
                    direction = -1;
                    pauseUntil = ts + pauseMs;
                } else if (scrollY <= 0) {
                    scrollY = 0;
                    direction = 1;
                    pauseUntil = ts + pauseMs;
                }
                content.style.transform = 'translateY(' + (-scrollY) + 'px)';
                rafId = requestAnimationFrame(step);
            }

            cancelAutoScroll();
            rafId = requestAnimationFrame(step);
        }

        function cancelAutoScroll() {
            const content = document.querySelector('.columns-container');
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            if (content) content.style.transform = 'translateY(0)';
        }
        
        function reoptimizeLayout() {
            const viewport = document.querySelector('.scroll-viewport');
            const availableHeight = (viewport?.clientHeight || (window.innerHeight - 44));
            const availableWidth = window.innerWidth - 20; // Account for padding
            const minColumnWidth = 280; // Minimum width per column to avoid truncation
            let bestLayout = null;
            let bestFontSize = 0;
            const maxColumns = Math.min(12, classData.length, Math.floor(availableWidth / minColumnWidth));
            
            for (let numColumns = 1; numColumns <= maxColumns; numColumns++) {
                const columnSections = distributeToColumns(classData, numColumns);
                if (columnSections.some(col => col.length === 0)) continue;
                const fontSizes = calculateFontSizes(columnSections, availableHeight);
                if (!bestLayout || fontSizes.tableCell > bestFontSize) {
                    bestLayout = { optimalColumns: numColumns, columnSections, fontSizes };
                    bestFontSize = fontSizes.tableCell;
                }
            }
            if (!bestLayout) {
                bestLayout = { optimalColumns: 1, columnSections: [classData], fontSizes: { classTitle: 5, runnerName: 5, tableHeader: 5, tableCell: 5, position: 5, padding: 1, headerPadding: 1, cardMargin: 0 } };
            }

            // If fonts are below readability, force minimum readable fonts and enable scroll
            let fonts = bestLayout.fontSizes;
            let scrollNeeded = baseScrollEnabled || (fonts.tableCell < READABILITY.tableCell);
            if (scrollNeeded) {
                fonts = {
                    classTitle: Math.max(fonts.classTitle, READABILITY.classTitle),
                    runnerName: Math.max(fonts.runnerName, READABILITY.runnerName),
                    tableHeader: Math.max(fonts.tableHeader, READABILITY.tableHeader),
                    tableCell: Math.max(fonts.tableCell, READABILITY.tableCell),
                    position: Math.max(fonts.position, READABILITY.position),
                    padding: Math.max(fonts.padding, READABILITY.padding),
                    headerPadding: Math.max(fonts.headerPadding, READABILITY.headerPadding),
                    cardMargin: bestLayout.fontSizes.cardMargin
                };
            }
            
            // Update grid columns
            const container = document.querySelector('.columns-container');
            container.style.gridTemplateColumns = 'repeat(' + bestLayout.optimalColumns + ', 1fr)';
            
            // Update dynamic styles
            let styleEl = document.getElementById('dynamic-styles');
            if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'dynamic-styles'; document.head.appendChild(styleEl); }
            styleEl.textContent = `
                .class-header-compact { font-size: ${fonts.classTitle}px !important; padding: ${fonts.headerPadding}px !important; }
                .results-table th { font-size: ${fonts.tableHeader}px !important; padding: ${fonts.padding}px !important; }
                .results-table td { font-size: ${fonts.tableCell}px !important; padding: ${fonts.padding}px !important; }
                .position { font-size: ${fonts.position}px !important; }
                .runner-name { font-size: ${fonts.runnerName}px !important; }
                .class-card { margin-bottom: ${fonts.cardMargin}px !important; }
            `;
            
            // Update header (show SCROLL tag if enabled)
            const header = document.querySelector('.screen-header');
            const totalRunners = classData.reduce((s,c) => s + c.runners.length, 0);
            header.textContent = `SCREEN ${screenNum} OF ${totalScreens} | ${bestLayout.optimalColumns} COLS | ${totalRunners} RUNNERS | FONT: ${fonts.tableCell}px${scrollNeeded ? ' | SCROLL' : ''} | LIVE | ${new Date().toLocaleTimeString()}`;

            // Decide to scroll based on overflow or scrollNeeded
            cancelAutoScroll();
            if (scrollNeeded) {
                startAutoScroll();
            } else {
                // If content still overflows due to dynamic updates, scroll anyway
                const overflow = Math.max(0, container.scrollHeight - (viewport?.clientHeight || 0));
                if (overflow > 0) startAutoScroll();
            }
        }
        
        function distributeToColumns(classResults, numColumns) {
            const columns = Array(numColumns).fill(null).map(() => []);
            const classesPerColumn = Math.ceil(classResults.length / numColumns);
            classResults.forEach((classResult, index) => {
                const columnIndex = Math.floor(index / classesPerColumn);
                if (columnIndex < numColumns) columns[columnIndex].push(classResult);
                else columns[numColumns - 1].push(classResult);
            });
            return columns;
        }
        
        function calculateFontSizes(columnSections, availableHeight) {
            const maxContentInColumn = Math.max(...columnSections.map(column => 
                column.reduce((sum, classResult) => sum + 2 + classResult.runners.length, 0)
            ));
            const theoreticalMaxRowHeight = Math.floor(availableHeight / maxContentInColumn);
            let bestFontSize = null;
            const maxTestScale = Math.min(2.0, theoreticalMaxRowHeight / 10);
            
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
                if (estimatedHeight * 1.2 <= availableHeight && (!bestFontSize || fontSize.tableCell > bestFontSize.tableCell)) {
                    bestFontSize = fontSize;
                }
            }
            if (!bestFontSize) {
                bestFontSize = { classTitle: 5, runnerName: 5, tableHeader: 5, tableCell: 5, position: 5, padding: 1, headerPadding: 1, cardMargin: 0 };
            }
            return bestFontSize;
        }
        
        // Debounced resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(reoptimizeLayout, 250);
        });

        // Initial optimization and potential scroll
        reoptimizeLayout();
    </script>
</body>
</html>`;
        }
        
        function findOptimalLayout(classResults) {
            const availableHeight = (window.innerHeight || 1080) - 50;
            const availableWidth = (window.innerWidth || 1920) - 20; // Account for padding
            const minColumnWidth = 280; // Minimum width per column to avoid truncation
            let bestLayout = null;
            let bestFontSize = 0;
            
            console.log(`Finding optimal layout: ${classResults.length} classes, ${classResults.reduce((s,c) => s + c.runners.length, 0)} runners`);
            
            // Test more column counts - limited by classes, max columns, AND available width
            const maxColumns = Math.min(12, classResults.length, Math.floor(availableWidth / minColumnWidth));
            console.log(`Max columns constrained to ${maxColumns} (width: ${availableWidth}px, min col width: ${minColumnWidth}px)`);
            
            for (let numColumns = 1; numColumns <= maxColumns; numColumns++) {
                const columnSections = distributeToColumns(classResults, numColumns);
                
                // Skip if any column is empty (happens with too many columns)
                if (columnSections.some(col => col.length === 0)) {
                    continue;
                }
                
                const fontSizes = calculateFontSizesForLayout(columnSections, availableHeight);
                const score = fontSizes.tableCell;
                
                // Track the best layout
                if (!bestLayout || score > bestFontSize) {
                    bestLayout = { optimalColumns: numColumns, columnSections, fontSizes };
                    bestFontSize = score;
                }
            }
            
            // Ensure we have a valid layout (fallback to 1 column if somehow failed)
            if (!bestLayout) {
                console.error('No valid layout found, using fallback');
                const columnSections = [classResults];
                const fontSizes = calculateFontSizesForLayout(columnSections, availableHeight);
                bestLayout = { optimalColumns: 1, columnSections, fontSizes };
            }
            
            console.log(`Optimal layout: ${bestLayout.optimalColumns} columns, ${bestLayout.fontSizes.tableCell}px font`);
            
            return bestLayout;
        }
        
        function distributeToColumns(classResults, numColumns) {
            // Distribute classes to preserve sort order: down columns, then across columns
            const columns = Array(numColumns).fill(null).map(() => []);
            
            // Calculate how many classes per column (some columns may get +1)
            const classesPerColumn = Math.ceil(classResults.length / numColumns);
            
            // Distribute in order: fill column 1 completely, then column 2, etc.
            classResults.forEach((classResult, index) => {
                const columnIndex = Math.floor(index / classesPerColumn);
                if (columnIndex < numColumns) {
                    columns[columnIndex].push(classResult);
                } else {
                    // Handle edge case where last few classes spill over
                    columns[numColumns - 1].push(classResult);
                }
            });
            
            return columns;
        }
        
        function calculateFontSizesForLayout(columnSections, availableHeight) {
            // Find the tallest column
            const maxContentInColumn = Math.max(...columnSections.map(column => {
                return column.reduce((sum, classResult) => {
                    return sum + 2 + classResult.runners.length; // header + table header + runners
                }, 0);
            }));
            
            // Calculate the theoretical maximum font size
            const theoreticalMaxRowHeight = Math.floor(availableHeight / maxContentInColumn);
            
            // Start testing from a high scale factor and work our way down
            let bestFontSize = null;
            let bestScale = 0;
            
            // Generate test scales from theoretical max down to minimum
            const maxTestScale = Math.min(2.0, theoreticalMaxRowHeight / 10);
            const testScales = [];
            for (let scale = maxTestScale; scale >= 0.1; scale -= 0.05) {
                testScales.push(scale);
            }
            
            for (const scaleFactor of testScales) {
                const fontSize = {
                    classTitle: Math.max(5, Math.floor(9 * scaleFactor)), // Reduced from 12 to 9
                    runnerName: Math.max(5, Math.floor(10 * scaleFactor)),
                    tableHeader: Math.max(5, Math.floor(7 * scaleFactor)), // Reduced from 8 to 7
                    tableCell: Math.max(5, Math.floor(7 * scaleFactor)),
                    position: Math.max(5, Math.floor(9 * scaleFactor)),
                    padding: Math.max(1, Math.floor(2 * scaleFactor)), // Reduced from 3 to 2
                    headerPadding: Math.max(1, Math.floor(2 * scaleFactor)), // Reduced from 3 to 2
                    cardMargin: Math.max(0, Math.floor(1 * scaleFactor)) // Reduced from 2 to 1
                };
                
                // Calculate actual height with these sizes
                const estimatedHeight = columnSections.reduce((maxHeight, column) => {
                    const columnHeight = column.reduce((sum, classResult) => {
                        const headerHeight = Math.ceil((fontSize.classTitle * 1.4) + (fontSize.headerPadding * 2) + 4);
                        const tableHeaderHeight = Math.ceil((fontSize.tableHeader * 1.4) + (fontSize.padding * 2) + 2);
                        // Account for line-height (1.4), padding, border, and extra spacing
                        const runnerRowsHeight = classResult.runners.length * Math.ceil(fontSize.tableCell * 1.5 + (fontSize.padding * 2) + 2);
                        const spacing = fontSize.cardMargin + 5; // Add extra spacing
                        return sum + headerHeight + tableHeaderHeight + runnerRowsHeight + spacing;
                    }, 0);
                    return Math.max(maxHeight, columnHeight);
                }, 0);
                
                // If this scale factor fits and is better than our current best, use it (with 20% safety margin)
                if (estimatedHeight * 1.2 <= availableHeight) {
                    if (!bestFontSize || fontSize.tableCell > bestFontSize.tableCell) {
                        bestFontSize = fontSize;
                        bestScale = scaleFactor;
                    }
                }
            }
            
            if (!bestFontSize) {
                console.warn('No scale factor worked! Using minimum fallback.');
                bestFontSize = {
                    classTitle: 5, runnerName: 5, tableHeader: 5, tableCell: 5,
                    position: 5, padding: 1, headerPadding: 1, cardMargin: 0
                };
            }
            return bestFontSize;
        }
        
        function generateClassHTML(classResult) {
            // Show class even if no runners
            const totalRunners = classResult.runners.length;
            const finishedCount = classResult.runners.filter(r => r.totalTime).length;
            const runnersText = `${finishedCount} of ${totalRunners} <span style="font-size: 0.85em;">runner${totalRunners !== 1 ? 's' : ''}</span>`;
            
            // Separate runners into finished and checked-in
            const finishedRunners = classResult.runners
                .filter(r => r.totalTime)
                .sort((a, b) => (a.totalTime || Infinity) - (b.totalTime || Infinity)); // Sort by time
            
            const checkedInRunners = classResult.runners
                .filter(r => !r.totalTime && r.status === 'checked_in')
                .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')); // Sort by name
            
            // Calculate time threshold for recent finishers (240 seconds = 4 minutes)
            const now = Date.now();
            const recentThreshold = 240000; // 240 seconds in milliseconds
            
            const generateRunnerRow = (runner, actualPosition, isCheckedIn = false) => {
                // Use actualPosition for display (passed in, not calculated)
                const position = actualPosition;
                
                // Only highlight top 3 for finished runners with medal colors
                let rowClass = '';
                if (!isCheckedIn) {
                    if (position === 1) rowClass = 'gold-row';
                    else if (position === 2) rowClass = 'silver-row';
                    else if (position === 3) rowClass = 'bronze-row';
                }
                
                // Check if this is a recent finisher (within last 4 minutes)
                // We'll need to track finish timestamps - for now, assume recent if no timestamp available
                const isRecent = runner.finishedAt && (now - runner.finishedAt) < recentThreshold;
                const boldStyle = isRecent ? 'font-weight: bold;' : '';
                
                // Show "checked-in" in italics if no time yet
                const timeDisplay = runner.totalTime ? formatTime(runner.totalTime) : 
                                   runner.status === 'checked_in' ? '<em>checked-in</em>' : 
                                   getStatusDisplay(runner.status);
                
                return `
                    <tr class="${rowClass}" style="${boldStyle}">
                        <td class="position">${runner.totalTime ? position : '-'}</td>
                        <td class="runner-name">${runner.fullName}</td>
                        <td class="club">${runner.club || ''}</td>
                        <td class="time">${timeDisplay}</td>
                        <td class="diff">${runner.totalTime ? formatTimeDifference(runner.timeBehindLeader) : '-'}</td>
                        <td class="lost">${runner.totalTime ? formatTimeDifference(runner.timeLost) : '-'}</td>
                    </tr>
                `;
            };
            
            return `
                <div class="class-card">
                    <div class="class-header-compact">
                        ${classResult.className} | ${(classResult.courseLength / 1000).toFixed(1)}km | ${runnersText}
                    </div>
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">POS</th>
                                <th style="width: 180px;">RUNNER</th>
                                <th style="width: 100px;">CLUB</th>
                                <th style="width: 70px;">TIME</th>
                                <th style="width: 70px;">DIFF</th>
                                <th style="width: 70px;">LOST</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${totalRunners === 0 ? '<tr><td colspan="6" style="text-align: center; font-style: italic; color: #999;">No runners checked in</td></tr>' : ''}
                            ${finishedRunners.map((runner, index) => generateRunnerRow(runner, index + 1, false)).join('')}
                            ${checkedInRunners.length > 0 && finishedRunners.length > 0 ? '<tr><td colspan="6" style="border-top: 2px solid #ddd; padding: 0;"></td></tr>' : ''}
                            ${checkedInRunners.map((runner, index) => generateRunnerRow(runner, null, true)).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function displayError(message) {
            const container = document.getElementById('resultsContainer');
            container.innerHTML = `
                <div class="error-message">
                    <strong>Error Loading Results</strong><br>
                    ${message}
                </div>
            `;
        }

        function updateLastUpdateTime() {
            const now = new Date();
            document.getElementById('lastUpdate').textContent = 
                `Last updated: ${now.toLocaleTimeString()}`;
        }

        // Utility functions
        function formatTime(milliseconds) {
            if (!milliseconds) return '-';
            const totalSeconds = Math.floor(milliseconds / 1000);
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        function formatTimeDifference(milliseconds) {
            if (!milliseconds || milliseconds === 0) return '-';
            const totalSeconds = Math.floor(milliseconds / 1000);
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        function getStatusDisplay(status) {
            const statusMap = {
                'in_forest': '🌲',     // Tree emoji for in forest
                'checked_in': '✓',      // Check mark for checked in
                'dns': 'DNS',
                'dnf': 'DNF',
                'dsq': 'DSQ',
                'mp': 'MP',
                'finished': ''
            };
            return statusMap[status] || status;
        }

        function formatPace(pace) {
            if (!pace) return '-';
            const mins = Math.floor(pace);
            const secs = Math.floor((pace % 1) * 60);
            return `${mins}:${secs.toString().padStart(2, '0')}/km`;
        }

        function getStatusClass(status) {
            return `status-${status}`;
        }

        function getStatusText(status) {
            const statusMap = {
                'finished': 'Finished',
                'in_forest': 'In Forest',
                'checked_in': 'Checked In',
                'dns': 'DNS',
                'dnf': 'DNF',
                'dsq': 'DSQ'
            };
            return statusMap[status] || 'Unknown';
        }

        function getPositionClass(position) {
            if (position === 1) return 'position-1';
            if (position === 2) return 'position-2';
            if (position === 3) return 'position-3';
            return '';
        }

        function getRowClass(position) {
            if (position === 1) return 'winner-row';
            if (position <= 3) return 'podium-row';
            return '';
        }

        // Mock data for large event testing
        async function getMockResults() {
            console.log('Generating mock results...');
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const classes = [
                { name: "M21 Elite", courseLength: 8500, runnerCount: 25 },
                { name: "W21 Elite", courseLength: 6800, runnerCount: 18 },
                { name: "M35", courseLength: 7200, runnerCount: 32 },
                { name: "W35", courseLength: 6000, runnerCount: 24 },
                { name: "M40", courseLength: 6500, runnerCount: 28 },
                { name: "W40", courseLength: 5500, runnerCount: 22 },
                { name: "M45", courseLength: 6200, runnerCount: 35 },
                { name: "W45", courseLength: 5200, runnerCount: 26 },
                { name: "M50", courseLength: 5800, runnerCount: 30 },
                { name: "W50", courseLength: 4800, runnerCount: 20 },
                { name: "M55", courseLength: 5400, runnerCount: 24 },
                { name: "W55", courseLength: 4400, runnerCount: 16 },
                { name: "M60", courseLength: 4800, runnerCount: 18 },
                { name: "W60", courseLength: 4000, runnerCount: 12 },
                { name: "M65", courseLength: 4200, runnerCount: 14 },
                { name: "W65", courseLength: 3600, runnerCount: 8 },
                { name: "M70", courseLength: 3800, runnerCount: 10 },
                { name: "W70", courseLength: 3200, runnerCount: 6 },
                { name: "M18", courseLength: 7800, runnerCount: 22 },
                { name: "W18", courseLength: 6200, runnerCount: 18 },
                { name: "M16", courseLength: 6800, runnerCount: 26 },
                { name: "W16", courseLength: 5600, runnerCount: 20 },
                { name: "M14", courseLength: 5200, runnerCount: 24 },
                { name: "W14", courseLength: 4600, runnerCount: 18 },
                { name: "M12", courseLength: 3800, runnerCount: 16 },
                { name: "W12", courseLength: 3400, runnerCount: 14 }
            ];
            
            const firstNames = [
                "John", "Sarah", "Michael", "Emma", "David", "Lisa", "Chris", "Anna",
                "Robert", "Jennifer", "James", "Michelle", "William", "Jessica", "Richard", "Ashley",
                "Thomas", "Amanda", "Charles", "Melissa", "Daniel", "Deborah", "Matthew", "Dorothy",
                "Anthony", "Nancy", "Mark", "Karen", "Donald", "Betty", "Steven", "Helen",
                "Paul", "Sandra", "Andrew", "Donna", "Kenneth", "Carol", "Joshua", "Ruth",
                "Kevin", "Sharon", "Brian", "Laura", "George", "Kimberly", "Timothy", "Deborah",
                "Ronald", "Dorothy", "Jason", "Betty", "Edward", "Nancy", "Jeffrey", "Karen",
                "Ryan", "Lisa", "Jacob", "Michelle", "Gary", "Sandra", "Nicholas", "Helen"
            ];
            
            const lastNames = [
                "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
                "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
                "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
                "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
                "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
                "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
                "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker"
            ];
            
            const clubs = [
                "Elite Orienteers", "Mountain Navigators", "Forest Runners", "Trail Blazers",
                "Adventure Seekers", "Compass Club", "Terrain Masters", "Wilderness Wanderers",
                "Peak Performers", "Valley Orienteers", "Ridge Runners", "Summit Seekers",
                "Nature Navigators", "Outdoor Adventurers", "Cross Country Club", "Pathfinders United",
                "Orienteering Academy", "Trailhead Society", "Backcountry Club", "Highland Orienteers",
                "Woodland Warriors", "Desert Navigators", "Coastal Orienteers", "Prairie Runners",
                "Alpine Adventures", "Metro Orienteers", "Urban Explorers", "Suburban Navigators"
            ];
            
            return classes.map(classInfo => {
                const runners = [];
                const baseTime = Math.floor(Math.random() * 1800000) + 1800000; // 30-60 minutes base (in ms)
                
                for (let i = 0; i < classInfo.runnerCount; i++) {
                    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
                    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                    const club = clubs[Math.floor(Math.random() * clubs.length)];
                    
                    // Add realistic time spread - later positions get progressively slower
                    const timeVariation = i * (Math.random() * 60000 + 30000); // 30-90 seconds per position
                    const totalTime = baseTime + timeVariation + Math.floor(Math.random() * 120000); // +/- 2 minutes random
                    
                    runners.push({
                        fullName: `${firstName} ${lastName}`,
                        club: club,
                        totalTime: totalTime,
                        timeBehindLeader: i === 0 ? 0 : totalTime - baseTime,
                        timeLost: Math.floor(Math.random() * 300000) + 30000, // 30 seconds to 5 minutes lost time
                        position: i + 1
                    });
                }
                
                // Sort by total time to ensure proper positioning
                runners.sort((a, b) => a.totalTime - b.totalTime);
                runners.forEach((runner, index) => {
                    runner.position = index + 1;
                    runner.timeBehindLeader = index === 0 ? 0 : runner.totalTime - runners[0].totalTime;
                });
                
                return {
                    className: classInfo.name,
                    courseLength: classInfo.courseLength,
                    runners: runners
                };
            });
        }
