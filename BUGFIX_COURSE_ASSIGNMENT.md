# Bug Fix: Course Assignment in MeOS XML

## Problem
When generating MeOS XML files, courses were not being assigned to classes when imported into MeOS.

## Root Cause
The generated XML was using the wrong element name for course assignment:

**Incorrect (our code):**
```xml
<Class>
  <Id>1</Id>
  <Updated>20251023201042</Updated>
  <Name>Blue</Name>
  <CourseId>1</CourseId>  <!-- WRONG TAG NAME -->
  <oData>
    ...
  </oData>
</Class>
```

**Correct (MeOS expects):**
```xml
<Class>
  <Id>1</Id>
  <Updated>20251023201042</Updated>
  <Name>Blue</Name>
  <Course>1</Course>  <!-- CORRECT TAG NAME -->
  <oData>
    ...
  </oData>
</Class>
```

## Evidence from MeOS Source Code
From `temp_meos/code/oClass.cpp`:

**Writing (lines 120-121):**
```cpp
if (Course)
  xml.write("Course", Course->Id);
```

**Reading (lines 153-154):**
```cpp
else if (it->is("Course")){
  Course = oe->getCourse(it->getInt());
}
```

MeOS expects `<Course>` as a **direct child element** of `<Class>`, not `<CourseId>`.

## Files Fixed
1. `src/modules/event-builder/services/meosXmlParser.ts` (line 405)
   - Changed: `xml += \`<Course>\${cls.courseId}</Course>\\n\`;`
   - Added conditional check: `if (cls.courseId)`

2. `src/components/EventBuilder.tsx`
   - Line 296: Changed `<CourseId>` to `<Course>`
   - Line 281: Added trailing semicolon to Controls element
   - Line 342: Changed file extension from `.xml` to `.meosxml`

## Additional Fixes
- Added trailing semicolon to `<Controls>` element to match MeOS format exactly
- Made course assignment conditional (only write if courseId exists)
- Changed file extension from `.xml` to `.meosxml` in EventBuilder.tsx

## File Extension
MeOS can import both `.xml` and `.meosxml` files, but `.meosxml` is the standard extension:
- `fileService.ts`: Already correctly uses `.meosxml` ✅
- `EventBuilder.tsx`: Now fixed to use `.meosxml` ✅

## Testing
After this fix:
1. Generate a new .meosxml file using Event Builder
2. Import into MeOS using "Import competition" feature
3. Verify that courses are properly assigned to classes in the Classes tab

## Related Files
- `src/modules/event-builder/services/meosXmlParser.ts` - Main XML parser/generator
- `src/components/EventBuilder.tsx` - Legacy event builder component
- `temp_meos/code/oClass.cpp` - MeOS source code reference
