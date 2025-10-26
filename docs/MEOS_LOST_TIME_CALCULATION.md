# MeOS Lost Time Calculation - Technical Documentation

## Summary

After deep analysis of the MeOS C++ source code, I discovered that the REST API attribute names are **misleading**. The total lost time shown in MeOS reports is calculated by summing the **`mistake`** attribute values from split analysis, NOT the `lost` attribute.

## MeOS C++ Implementation

### Core Method: `oRunner::getMissedTime()`

Located in `temp_meos/code/oRunner.cpp` (lines 6204-6212):

```cpp
int oRunner::getMissedTime() const {
  setupRunnerStatistics();
  int t = 0;
  for (size_t k = 0; k < tMissedTime.size(); k++) {
    if (tMissedTime[k] > 0)
      t += tMissedTime[k];
  }
  return t;
}
```

This method:
1. Calls `setupRunnerStatistics()` which populates `tMissedTime` via `getSplitAnalysis()`
2. Sums **only positive** values from `tMissedTime`
3. Returns the total lost/missed time

### Split Analysis Algorithm: `oRunner::getSplitAnalysis()`

Located in `temp_meos/code/oRunner.cpp` (lines 5860-5962):

```cpp
void oRunner::getSplitAnalysis(vector<int>& deltaTimes) const {
  // Complex algorithm that:
  // 1. Gets baseline/best split times for the course
  // 2. Compares runner's splits against baseline
  // 3. Adjusts for overall pace
  // 4. Only marks splits as "lost time" if:
  //    - Delta > 1% AND
  //    - Delta > 10% of leg time AND
  //    - Delta >= 20 seconds
}
```

## REST API Attribute Mapping

Located in `temp_meos/code/restserver.cpp` (lines 1190-1204):

```cpp
// Analysis attributes in XML output:
analysis[0].second = formatTime(after[ix]);           // "lost" attribute
analysis[1].second = formatTime(afterAcc[ix]);        // "behind" attribute  
analysis[2].second = formatTime(delta[ix]);           // "mistake" attribute
```

### The Misleading Names

The XML `Analysis` element attributes mean:

| XML Attribute | MeOS C++ Variable | Actual Meaning |
|---------------|-------------------|----------------|
| `lost` | `after[ix]` | Time behind **leg leader** for that specific leg |
| `behind` | `afterAcc[ix]` | **Accumulated** time behind leader |
| `mistake` | `delta[ix]` | **Actual calculated lost/missed time** from `getSplitAnalysis()` |

## Correct Implementation

To get the total lost time that matches MeOS reports:

```typescript
const calculateTotalLostTime = (splits: any[]): number => {
  if (!splits || splits.length === 0) return 0;
  
  let totalLostSeconds = 0;
  
  for (const split of splits) {
    // Use 'mistake', NOT 'lost'
    if (split.analysis && split.analysis.mistake) {
      const mistakeSeconds = parseTimeStringToSeconds(split.analysis.mistake);
      // Only sum positive values (as per MeOS getMissedTime logic)
      if (mistakeSeconds > 0) {
        totalLostSeconds += mistakeSeconds;
      }
    }
  }
  
  return totalLostSeconds;
};
```

## Example XML from MeOS API

```xml
<Control number="1">
  <Name>[31]</Name>
  <Time>6:25</Time>
  <Analysis lost="1:11" behind="1:11" mistake="0:45" leg="5" total="3"/>
</Control>
```

In this example:
- **`lost="1:11"`** = This runner was 1:11 behind the leg leader on this split
- **`behind="1:11"`** = This runner was 1:11 behind accumulated 
- **`mistake="0:45"`** = The algorithm determined this runner lost 45 seconds on this split ← **USE THIS**

## Files Updated

1. `src/components/LiveResults.tsx` - Fixed `calculateTotalLostTime()` to use `mistake` attribute
2. `src/components/LiveResultsDisplay.tsx` - Fixed `calculateTotalTimeLost()` to use `mistake` attribute

Both now correctly match MeOS's total lost time calculation.

## References

- MeOS C++ source: `temp_meos/code/oRunner.cpp` (getMissedTime, getSplitAnalysis)
- REST API implementation: `temp_meos/code/restserver.cpp` (lookup competitor endpoint)
- MeOS API documentation: `C:\Users\drads\Downloads\MeOS Information Service.html`
