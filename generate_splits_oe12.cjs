/**
 * Generate OE12-style splits HTML
 * Run with: node generate_splits_oe12.cjs
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Setup DOM for DOMParser
const dom = new JSDOM('<!DOCTYPE html>');
global.DOMParser = dom.window.DOMParser;

function parseOE12XML(xmlContent) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
  
  const results = [];
  const classResults = xmlDoc.querySelectorAll('ClassResult');
  
  classResults.forEach(classResultElement => {
    const classElement = classResultElement.querySelector('Class');
    const courseElement = classResultElement.querySelector('Course');
    
    const classId = classElement?.querySelector('Id')?.textContent?.trim() || '';
    const className = classElement?.querySelector('Name')?.textContent?.trim() || `Class ${classId}`;
    const courseId = courseElement?.querySelector('Id')?.textContent?.trim();
    const courseName = courseElement?.querySelector('Name')?.textContent?.trim();
    const courseLength = courseElement?.querySelector('Length')?.textContent?.trim();
    const courseClimb = courseElement?.querySelector('Climb')?.textContent?.trim();
    const numControls = courseElement?.querySelector('NumberOfControls')?.textContent?.trim();
    
    const runners = [];
    const personResults = classResultElement.querySelectorAll('PersonResult');
    
    personResults.forEach(personResult => {
      const personElement = personResult.querySelector('Person');
      const orgElement = personResult.querySelector('Organisation');
      const resultElement = personResult.querySelector('Result');
      
      if (!personElement || !resultElement) return;
      
      const familyName = personElement.querySelector('Name > Family')?.textContent?.trim() || '';
      const givenName = personElement.querySelector('Name > Given')?.textContent?.trim() || '';
      const name = `${givenName} ${familyName}`.trim();
      const gender = personElement.getAttribute('sex') || '';
      const club = orgElement?.querySelector('Name')?.textContent?.trim() || '';
      const status = resultElement.querySelector('Status')?.textContent?.trim() || 'Unknown';
      const timeText = resultElement.querySelector('Time')?.textContent?.trim() || '0';
      const position = resultElement.querySelector('Position')?.textContent?.trim() || '';
      const startNumber = resultElement.querySelector('BibNumber')?.textContent?.trim() || '';
      
      // Parse splits
      const splits = [];
      const splitElements = resultElement.querySelectorAll('SplitTime');
      splitElements.forEach(split => {
        const controlCode = split.querySelector('ControlCode')?.textContent?.trim() || '';
        const time = split.querySelector('Time')?.textContent?.trim() || '0';
        // Include all splits including finish punch
        splits.push({ controlCode, time: parseInt(time) });
      });
      
      runners.push({
        id: `${classId}_${position}`,
        name,
        club,
        status,
        runTime: timeText,
        place: position,
        startNumber,
        gender,
        splits: splits.length > 0 ? splits : undefined
      });
    });
    
    // Sort runners by place only (match OE ordering within class)
    runners.sort((a, b) => {
      const placeA = parseInt(a.place) || 999;
      const placeB = parseInt(b.place) || 999;
      if (placeA !== placeB) return placeA - placeB;
      return a.name.localeCompare(b.name);
    });
    
    results.push({
      classId,
      className,
      courseId,
      courseName,
      courseLength: courseLength ? parseInt(courseLength) : undefined,
      courseClimb: courseClimb ? parseInt(courseClimb) : undefined,
      numControls: numControls ? parseInt(numControls) : undefined,
      runners
    });
  });
  
  // Preserve OE class order as it appears in the XML
  return results;
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '-----';
  const totalSeconds = typeof seconds === 'string' ? parseInt(seconds) : seconds;
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getColorForTime(time, bestTime, worstTime) {
  if (time === bestTime) {
    return { color: '#008000', bold: true }; // Green, bold for best
  }
  
  // Calculate percentage behind best (0 = best, 1 = worst)
  const range = worstTime - bestTime;
  if (range === 0) return { color: '#000000', bold: false };
  
  const percentBehind = (time - bestTime) / range;
  
  // Color gradient: green -> yellow -> orange -> red
  if (percentBehind < 0.15) {
    return { color: '#00a000', bold: false }; // Light green
  } else if (percentBehind < 0.30) {
    return { color: '#000000', bold: false }; // Black (good)
  } else if (percentBehind < 0.50) {
    return { color: '#c08000', bold: false }; // Orange
  } else if (percentBehind < 0.75) {
    return { color: '#d04000', bold: false }; // Dark orange
  } else {
    return { color: '#c00000', bold: false }; // Red (slow)
  }
}

function generateSplitsHTML(classResults, eventName, eventDate) {
  const timestamp = new Date().toLocaleString();
  
  // Group classes by course name for splits
  const courseMap = new Map();
  classResults.forEach(classResult => {
    const courseName = classResult.courseName || classResult.className;
    if (!courseMap.has(courseName)) {
      courseMap.set(courseName, []);
    }
    courseMap.get(courseName).push(classResult);
  });
  
  let html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="content-type" content="text/html; charset=utf-8">
<meta name="robots" content="noindex,nofollow">

<style type="text/css">
body { color: #000000; background-color: #ffffff; 
       font: 10pt/1.2 Arial, Helvetica, sans-serif; }
table { table-layout:fixed; border-collapse: collapse; border-spacing: 0px; 
        padding: 0; margin: 0; border: none; }
th { background-color: #ebffeb; color: blue; font-weight: normal;
     border: none; white-space:nowrap; text-align: left;
     padding: 0px 3px 3px 3px; vertical-align: bottom;
     font: 10pt/1.2 Arial, Helvetica, sans-serif; }
td { padding-left: 3px; padding-right: 3px;
     border: none; overflow:hidden; vertical-align: bottom;
     white-space:nowrap; text-align: left;
     font: 10pt/1.2 Arial, Helvetica, sans-serif; }
#reporttop { background-color: #FFFFE0; font-weight: bold; padding: 0;
             border: none; margin: 0; width: 100%; }
#reporttop td { vertical-align: bottom; }
#ln { font-size: 5pt; }
tr#ev { background-color: #FFFFE0; }
tr#fix { background-color: #E0FFFF; }
#rb { text-align: right; }
#ce { text-align: center; }
#c00 { background-color: #ebffeb; color: black; padding: 5px 3px 2px 3px; font-weight: bold; }
#c01 { background-color: #ebffeb; color: black; padding: 5px 3px 2px 3px; font-weight: bold; text-align: right; }
#c02 { background-color: #ebffeb; color: black; padding: 5px 3px 2px 3px; font-weight: bold; text-align: right; }
#c10 { font-weight: bold; text-align: right; }
#c11 { font-weight: bold; text-align: right; }
#c12 { font-weight: bold; }
#c14 { font-weight: bold; text-align: right; }
.best { font-weight: bold; }
</style>

<title>${eventName} - Split time results</title>
</head>

<body>
<div id=reporttop>
<table width=1382px style="table-layout:auto;">
<tr><td><nobr>${eventName}</nobr><td id=rb><nobr>${timestamp}</nobr></tr>
<tr><td><nobr>Split time results</nobr><td id=rb style="font-weight:normal; font-size: 7pt;"><nobr>created by DVOA Event Management System</nobr></tr>
</table>
<hr>
</div>
<table id=ln><tr><td>&nbsp</td></tr></table>
`;
  
  // Generate splits for each course
  courseMap.forEach((classes, courseName) => {
    // Get all runners from all classes on this course
    const allRunnersOnCourse = [];
    let courseLength;
    let courseClimb;
    let numControls;
    
    classes.forEach(classResult => {
      const runnersWithSplits = classResult.runners.filter(r => r.splits && r.splits.length > 0);
      runnersWithSplits.forEach(runner => {
        allRunnersOnCourse.push({
          ...runner,
          club: `${runner.club}|${classResult.className}` // Store class name with club
        });
      });
      if (!courseLength && classResult.courseLength) {
        courseLength = classResult.courseLength;
      }
      if (!courseClimb && classResult.courseClimb) {
        courseClimb = classResult.courseClimb;
      }
      if (!numControls && classResult.numControls) {
        numControls = classResult.numControls;
      }
    });
    
    // Sort all runners on this course by finish time (OK status first, then by time)
    allRunnersOnCourse.sort((a, b) => {
      // OK status comes first
      if (a.status === 'OK' && b.status !== 'OK') return -1;
      if (a.status !== 'OK' && b.status === 'OK') return 1;
      
      // Both OK - sort by time
      if (a.status === 'OK' && b.status === 'OK') {
        const timeA = typeof a.runTime === 'string' ? parseInt(a.runTime) : a.runTime;
        const timeB = typeof b.runTime === 'string' ? parseInt(b.runTime) : b.runTime;
        return timeA - timeB;
      }
      
      // Neither OK - sort by name
      return a.name.localeCompare(b.name);
    });
    
    // Assign course-based place numbers (renumber 1, 2, 3... based on course finish order)
    let coursePlace = 1;
    allRunnersOnCourse.forEach((runner) => {
      if (runner.status === 'OK') {
        runner.place = coursePlace.toString();
        coursePlace++;
      } else {
        runner.place = ''; // No place for non-finishers
      }
    });
    
    const runnersWithSplits = allRunnersOnCourse;
    if (runnersWithSplits.length === 0) return;
    
    const courseInfo = [];
    if (courseLength) {
      courseInfo.push(`${(courseLength / 1000).toFixed(1)} km`);
    }
    if (courseClimb) {
      courseInfo.push(`${courseClimb} m`);
    }
    const courseInfoText = courseInfo.join('  ');
    
    const numControlsDisplay = numControls || runnersWithSplits[0].splits.length;
    const controlsText = `${numControlsDisplay} C`;
    
    html += `
<table id=ln><tr><td>&nbsp</td></tr></table>
<table width=1382px>
<tbody>
<tr><td id=c00 width=248px>${courseName}  (${runnersWithSplits.length})<td id=c01 width=168px>${courseInfoText}<td id=c02 width=82px>${controlsText}<td id="header"></td>
</tr>
</tbody>
</table>
`;
    
    // Determine how many controls and split into rows
    const controls = runnersWithSplits[0].splits;
    const maxControlsPerRow = 14;
    const controlRows = [];
    
    for (let i = 0; i < controls.length; i += maxControlsPerRow) {
      controlRows.push(controls.slice(i, i + maxControlsPerRow));
    }
    
    // Generate control headers
    html += `
<table width=1382px>
<col width=40px>
<col width=50px>
<col width=130px>
<col width=120px>
<col width=64px>`;
    
    for (let i = 0; i < maxControlsPerRow; i++) {
      html += `\n<col width=71px>`;
    }
    
    html += `
<thead>
<tr><th id=rb>Pl</th><th id=rb>Stno</th><th>Name</th><th>Cl.</th><th id=rb>Time</th>`;
    
    for (let i = 0; i < maxControlsPerRow; i++) {
      html += `<th id=rb></th>`;
    }
    html += `<th></th></tr>
</thead>
<tbody>
</tbody>
</table>
<table width=1382px>
<col width=40px>
<col width=50px>
<col width=130px>
<col width=120px>
<col width=64px>`;
    
    for (let i = 0; i < maxControlsPerRow; i++) {
      html += `\n<col width=71px>`;
    }
    
    html += `
<tbody>
`;
    
    // Generate control code rows
    controlRows.forEach((rowControls, rowIndex) => {
      const bgClass = rowIndex % 2 === 0 ? '' : 'id=ev';
      html += `<tr ${bgClass}><td id=c10><td id=c11><td id=c12><nobr></nobr><td><nobr></nobr><td id=c14>`;
      
      rowControls.forEach((control, idx) => {
        const controlNum = rowIndex * maxControlsPerRow + idx + 1;
        const isLast = (rowIndex === controlRows.length - 1) && (idx === rowControls.length - 1);
        const label = isLast ? 'Finish' : `${controlNum}(${control.controlCode})`;
        html += `<td id=rb>${label}`;
      });
      
      // Fill empty cells
      for (let i = rowControls.length; i < maxControlsPerRow; i++) {
        html += `<td id=rb>`;
      }
      html += `</tr>\n`;
    });
    
    html += `<tr><td id=c10><nobr>&nbsp</nobr></tr>\n`;
    
    // Calculate best and worst times for each split (leg and cumulative)
    const numSplits = runnersWithSplits[0].splits.length;
    const bestCumulativeTimes = new Array(numSplits).fill(Infinity);
    const worstCumulativeTimes = new Array(numSplits).fill(0);
    const bestLegTimes = new Array(numSplits).fill(Infinity);
    const worstLegTimes = new Array(numSplits).fill(0);
    
    // Find best and worst times for coloring
    runnersWithSplits.forEach(runner => {
      if (runner.status !== 'OK') return;
      
      let prevTime = 0;
      runner.splits.forEach((split, idx) => {
        const cumulativeTime = split.time;
        const legTime = split.time - prevTime;
        
        if (cumulativeTime > 0) {
          bestCumulativeTimes[idx] = Math.min(bestCumulativeTimes[idx], cumulativeTime);
          worstCumulativeTimes[idx] = Math.max(worstCumulativeTimes[idx], cumulativeTime);
        }
        
        if (legTime > 0) {
          bestLegTimes[idx] = Math.min(bestLegTimes[idx], legTime);
          worstLegTimes[idx] = Math.max(worstLegTimes[idx], legTime);
        }
        
        prevTime = split.time;
      });
    });
    
    // Generate runner splits
    runnersWithSplits.forEach((runner, runnerIdx) => {
      const bgClass = runnerIdx % 2 === 0 ? 'id=fix' : '';
      const place = runner.place || '';
      const stno = runner.startNumber || '';
      const totalTime = runner.status === 'OK' ? formatTime(runner.runTime) : runner.status.toLowerCase();
      
      // Calculate leg times
      const legTimes = [];
      let prevTime = 0;
      runner.splits.forEach(split => {
        const legTime = split.time - prevTime;
        legTimes.push(legTime);
        prevTime = split.time;
      });
      
      // Extract class name and club from the combined field
      const [actualClub, className] = (runner.club || '|').split('|');
      
      // Row 1: Name and cumulative times (first set of controls)
      html += `<tr ${bgClass}><td id=c10>${place}<td id=c11>${stno}<td id=c12><nobr>${runner.name}</nobr><td><nobr>${className || ''}</nobr><td id=c14>${totalTime}`;
      
      const firstRowControls = Math.min(maxControlsPerRow, runner.splits.length);
      for (let i = 0; i < firstRowControls; i++) {
        const cumulativeTime = runner.splits[i].time;
        const styling = runner.status === 'OK' ? 
          getColorForTime(cumulativeTime, bestCumulativeTimes[i], worstCumulativeTimes[i]) : 
          { color: '#000000', bold: false };
        const fontWeight = styling.bold ? 'bold' : 'normal';
        html += `<td id=rb style="font-weight: ${fontWeight}; color: ${styling.color};">${formatTime(cumulativeTime)}`;
      }
      for (let i = firstRowControls; i < maxControlsPerRow; i++) {
        html += `<td id=rb>`;
      }
      html += `</tr>\n`;
      
      // Row 2: Club and leg times (first set of controls)
      html += `<tr><td id=c10><td id=c11><td id=c12><nobr>${actualClub || ''}</nobr><td><nobr></nobr><td id=c14>`;
      
      for (let i = 0; i < firstRowControls; i++) {
        const legTime = legTimes[i];
        const styling = runner.status === 'OK' ? 
          getColorForTime(legTime, bestLegTimes[i], worstLegTimes[i]) : 
          { color: '#000000', bold: false };
        const fontWeight = styling.bold ? 'bold' : 'normal';
        html += `<td id=rb style="font-weight: ${fontWeight}; font-style: italic; color: ${styling.color};">${formatTime(legTime)}`;
      }
      for (let i = firstRowControls; i < maxControlsPerRow; i++) {
        html += `<td id=rb>`;
      }
      html += `</tr>\n`;
      
      // Additional rows if more than maxControlsPerRow controls
      if (runner.splits.length > maxControlsPerRow) {
        for (let rowIdx = 1; rowIdx < controlRows.length; rowIdx++) {
          const startIdx = rowIdx * maxControlsPerRow;
          const endIdx = Math.min(startIdx + maxControlsPerRow, runner.splits.length);
          const bgClass2 = rowIdx % 2 === 0 ? '' : 'id=ev';
          
          // Cumulative times
          html += `<tr ${bgClass2}><td id=c10><td id=c11><td id=c12><nobr></nobr><td><nobr></nobr><td id=c14>`;
          for (let i = startIdx; i < endIdx; i++) {
            const cumulativeTime = runner.splits[i].time;
            const styling = runner.status === 'OK' ? 
              getColorForTime(cumulativeTime, bestCumulativeTimes[i], worstCumulativeTimes[i]) : 
              { color: '#000000', bold: false };
            const fontWeight = styling.bold ? 'bold' : 'normal';
            html += `<td id=rb style="font-weight: ${fontWeight}; color: ${styling.color};">${formatTime(cumulativeTime)}`;
          }
          for (let i = endIdx - startIdx; i < maxControlsPerRow; i++) {
            html += `<td id=rb>`;
          }
          html += `</tr>\n`;
          
          // Leg times
          html += `<tr><td id=c10><td id=c11><td id=c12><nobr></nobr><td><nobr></nobr><td id=c14>`;
          for (let i = startIdx; i < endIdx; i++) {
            const legTime = legTimes[i];
            const styling = runner.status === 'OK' ? 
              getColorForTime(legTime, bestLegTimes[i], worstLegTimes[i]) : 
              { color: '#000000', bold: false };
            const fontWeight = styling.bold ? 'bold' : 'normal';
            html += `<td id=rb style="font-weight: ${fontWeight}; font-style: italic; color: ${styling.color};">${formatTime(legTime)}`;
          }
          for (let i = endIdx - startIdx; i < maxControlsPerRow; i++) {
            html += `<td id=rb>`;
          }
          html += `</tr>\n`;
        }
      }
      
      html += `<tr><td id=c10><nobr>&nbsp</nobr></tr>\n`;
    });
    
    html += `</tbody>
</table>
`;
  });
  
  html += `
</body>
</html>`;
  
  return html;
}

// Main test
const xmlPath = 'C:\\Users\\drads\\OneDrive\\DVOA\\2025\\Warwick25\\Warwick25.xml';
const outputDir = 'C:\\Users\\drads\\OneDrive\\DVOA\\2025\\Warwick25';

console.log('Reading XML file...');
const xmlContent = fs.readFileSync(xmlPath, 'utf8');

console.log('Parsing XML...');
const classResults = parseOE12XML(xmlContent);

console.log(`Found ${classResults.length} classes`);

console.log('\nGenerating splits HTML...');
const html = generateSplitsHTML(classResults, 'NJROTC 2025 Area 2 Champs', '2025-10-25');

const outputPath = path.join(outputDir, 'splits_by_course.html');
fs.writeFileSync(outputPath, html);

console.log(`\n✅ Splits generated successfully!`);
console.log(`Output file: ${outputPath}`);
