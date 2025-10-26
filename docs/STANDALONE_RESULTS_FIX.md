# Standalone Live Results Fix - Lost Time Display

## Problem
Lost time was not displaying on the standalone live results pages (`live_results_api.js`).

## Root Cause
There were TWO bugs in `public/live_results_api.js`:

### Bug 1: Wrong XML Path
The `lookupCompetitor()` function was looking for splits at the wrong XML path:
- **Incorrect**: `competitor.Result?.SplitTime`
- **Correct**: `competitor.Splits?.Control`

### Bug 2: Wrong Attribute
The `calculateTotalTimeLost()` function was using the wrong attribute:
- **Incorrect**: `split.analysis.lost` (time behind leg leader)
- **Correct**: `split.analysis.mistake` (actual calculated lost time)

## Files Fixed

### `public/live_results_api.js`

**Lines 546-576** - Fixed `lookupCompetitor()` function:
```javascript
// OLD (wrong):
const splitList = competitor.Result?.SplitTime;
...
lost: split.Analysis['@attributes']?.lost || ''

// NEW (correct):
const splitList = competitor.Splits?.Control;
...
mistake: analysis['@attributes']?.mistake || ''
```

**Lines 583-616** - Fixed `calculateTotalTimeLost()` function:
```javascript
// OLD (wrong):
if (split.analysis && split.analysis.lost) {
    const lostMs = parseTimeString(split.analysis.lost);
    totalLost += lostMs;
}

// NEW (correct):
if (split.analysis && split.analysis.mistake) {
    const lostMs = parseTimeString(split.analysis.mistake);
    if (lostMs > 0) {  // Only positive values
        totalLost += lostMs;
    }
}
```

## Testing
1. Open `public/live_results_api.html` in your browser
2. Make sure MeOS is running with the Information Server enabled
3. Open browser console (F12)
4. You should see detailed logs showing:
   ```
   🔍 Fetching split analysis for X runners in ClassName...
     📊 Found 8 splits for competitor
       Split 1: mistake="0:45"
       Split 3: mistake="1:20"
     ✅ Calculated 2 mistakes totaling 125000ms (2:05)
   ```
5. Lost time values should now display in the "LOST" column

## Important Notes

1. **This fix applies to standalone HTML pages**, not the React components
2. The standalone pages are in the `public/` folder and can be opened directly in a browser
3. Main pages affected:
   - `public/live_results_api.html`
   - `public/live_results.html` (if it uses similar code)
   - `public/live_results_xml.html` (if it uses similar code)

## Related Fixes

If you're using other standalone result pages, check if they need similar fixes:
- `public/live_results.js`
- `public/live_results_xml.js`

Search for `calculateTotalTimeLost` and verify it's using `split.analysis.mistake` not `split.analysis.lost`.

## MeOS Analysis Attributes Reference

| Attribute | Meaning | Usage |
|-----------|---------|-------|
| `lost` | Time behind leg leader for that split | ❌ Don't use for total lost time |
| `behind` | Accumulated time behind leader | ❌ Don't use for total lost time |
| `mistake` | Calculated lost/missed time | ✅ **Use this for total lost time** |

## See Also
- `LOST_TIME_BUG_FIX.md` - Fix for React components
- `MEOS_LOST_TIME_CALCULATION.md` - Technical details from MeOS C++ source
