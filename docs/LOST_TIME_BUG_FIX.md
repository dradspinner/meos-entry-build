# Lost Time Display Bug Fix

## Problem
Lost time was not displaying on the live results screens despite the code appearing correct.

## Root Cause
The bug was in `src/services/meosApi.ts` in the `parseCompetitorData()` method. The Analysis attributes were being parsed incorrectly from the XML response.

### Incorrect Code (Before)
```typescript
analysis: analysis ? {
  lost: getName(analysis['@attributes']?.lost),
  behind: getName(analysis['@attributes']?.behind),
  mistake: getName(analysis['@attributes']?.mistake),
  leg: parseInt(getAttr(analysis, 'leg') || '0'),
  total: parseInt(getAttr(analysis, 'total') || '0')
} : null
```

The code was calling `getName()` on the attributes, which wraps them in the `['#text']` accessor. However, XML attributes are accessed directly via `@attributes`, and `getName()` is only needed for XML element text content.

### Correct Code (After)
```typescript
analysis: analysis ? {
  // Analysis attributes are directly on the Analysis element, not nested
  lost: getAttr(analysis, 'lost') || '',
  behind: getAttr(analysis, 'behind') || '',
  mistake: getAttr(analysis, 'mistake') || '',
  leg: parseInt(getAttr(analysis, 'leg') || '0'),
  total: parseInt(getAttr(analysis, 'total') || '0')
} : null
```

## MeOS XML Structure
The Analysis element from MeOS looks like this:

```xml
<Control number="1">
  <Name>[31]</Name>
  <Time>6:25</Time>
  <Analysis lost="1:11" behind="1:11" mistake="0:45" leg="5" total="3"/>
</Control>
```

The attributes (`lost`, `behind`, `mistake`, `leg`, `total`) are **XML attributes**, not nested elements, so they should be accessed using `getAttr()` not `getName()`.

## Files Modified

1. **`src/services/meosApi.ts`** (lines 950-966)
   - Fixed parsing of Analysis attributes to use `getAttr()` instead of `getName()`

2. **`src/components/LiveResultsDisplay.tsx`** (lines 151-203)
   - Added extensive debugging logs to help trace split analysis data
   - Already had correct logic to use `mistake` attribute for lost time calculation

3. **`src/components/LiveResults.tsx`** (lines 295-320)
   - Already had correct logic to use `mistake` attribute for lost time calculation

## Testing
After this fix:
1. Open the browser console (F12)
2. Navigate to the live results page
3. Look for console output showing:
   - Split analysis being fetched for each runner
   - Individual split mistakes being logged
   - Total lost time calculated for each runner

Expected console output:
```
🔍 Fetching split analysis for 5 runners in Blue...
  🔍 Fetching details for John Doe (ID: 123)...
  ✅ Got details for John Doe: { hasSplits: true, splitCount: 8, timeAfterMs: 67000 }
  📊 Splits for John Doe: [...split data with mistake values...]
    📌 Split 1: mistake="0:45" = 45000ms
    📌 Split 3: mistake="1:20" = 80000ms
    ✅ Found 2 mistakes totaling 125000ms
  🎯 Total lost time for John Doe: 125000ms (2:05)
```

## Important Notes

1. **Attribute names are misleading**: 
   - `lost` = time behind leg leader (NOT total lost time)
   - `mistake` = actual calculated lost time ← **This is what we use**

2. **Lost time calculation**: Only **positive** mistake values are summed, matching MeOS's `getMissedTime()` logic

3. **Time format**: Analysis attributes are in `MM:SS` format (e.g., "1:20" = 1 minute 20 seconds)

## Related Documentation
- See `MEOS_LOST_TIME_CALCULATION.md` for detailed explanation of MeOS's lost time algorithm
- MeOS C++ source: `temp_meos/code/oRunner.cpp` and `temp_meos/code/restserver.cpp`
