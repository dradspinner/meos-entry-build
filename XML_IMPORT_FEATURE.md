# Runner Database XML Import Feature

## Overview
The Runner Database Manager now supports importing runner data from XML files with two import modes: **Merge/Sync** and **Replace All**.

## Location
**Tools → Runner Database → Import XML button**

## Import Modes

### Merge/Sync Mode (Recommended) ✅
**Safe option - No data loss**

- ✅ Adds new runners from the XML file
- ✅ Updates existing runners with data from XML (matches by first + last name)
- ✅ Keeps all existing runners not present in the XML file
- ✅ Shows summary: "Merged X runners: Y new, Z updated"

**Use when:**
- Syncing with an external database
- Adding runners from a recent event
- Updating information for existing runners
- You want to preserve your local database

### Replace All Mode ⚠️
**Destructive option - Use with caution**

- ⚠️ Deletes ALL existing runners from the database
- ⚠️ Replaces with ONLY the runners from the XML file
- ⚠️ Cannot be undone (except via backup restore)

**Use when:**
- Starting fresh with a new database
- Completely replacing outdated data
- You're certain you don't need existing runners

## Supported XML Format

The import supports **IOF XML 3.0** format with the following structure:

```xml
<ResultList>
  <ClassResult>
    <Class>...</Class>
    <PersonResult>
      <Person sex="M">
        <Name>
          <Given>John</Given>
          <Family>Doe</Family>
        </Name>
        <BirthDate>1990-05-15</BirthDate>
      </Person>
      <Organisation>
        <Id>852</Id>
        <Name>DVOA</Name>
      </Organisation>
      <Result>
        <ControlCard>12345</ControlCard>
      </Result>
    </PersonResult>
  </ClassResult>
</ResultList>
```

Or the simpler **Competitor** format:

```xml
<CompetitorList>
  <Competitor>
    <Person sex="F">
      <Name>
        <Given>Jane</Given>
        <Family>Smith</Family>
      </Name>
      <BirthDate>1985-03-20</BirthDate>
    </Person>
    <Organisation>
      <Name>QOC</Name>
    </Organisation>
    <ControlCard>67890</ControlCard>
  </Competitor>
</CompetitorList>
```

## Extracted Fields

From the XML, the following runner information is extracted:

| Field | XML Source | Notes |
|-------|-----------|-------|
| **First Name** | `<Given>` | Required |
| **Last Name** | `<Family>` | Required |
| **Sex** | `Person[@sex]` attribute | M or F |
| **Birth Year** | `<BirthDate>` | Extracts year only |
| **Club** | `<Organisation><Name>` or `<Id>` | Maps known org IDs |
| **SI Card** | `<ControlCard>` | Numeric only |

**Club ID Mappings:**
- `852` → DVOA
- `3` → QOC
- `4` → HVO
- `14` → None
- `90010` → CSU
- Other IDs → `Org-{ID}`

## How to Use

1. **Open Runner Database**
   - Navigate to: Tools → Runner Database
   
2. **Click "Import XML" button**
   - Located in the modal header next to "Add Runner"
   
3. **Select your XML file**
   - Choose a valid IOF XML 3.0 file
   
4. **Choose Import Mode**
   - A modal will appear with two options:
     - **Merge/Sync** (green) - Recommended for most cases
     - **Replace All** (red) - Use with caution
   
5. **Confirm**
   - Click your chosen mode button
   - Wait for the import to complete
   
6. **Review Results**
   - Success message shows:
     - Merge mode: "Merged X runners: Y new, Z updated"
     - Replace mode: "Replaced database with X runners from {filename}"

## Import Process

The import follows these steps:

1. **Parse XML**: Read and validate the XML file
2. **Extract Runners**: Parse each `<Competitor>` or `<PersonResult>` element
3. **Validate**: Ensure required fields (first name, last name) are present
4. **Clear Database** (Replace mode only): Delete all existing runners
5. **Add/Update**: 
   - Merge mode: Check if runner exists (by name), update if found, add if new
   - Replace mode: Add all runners as new entries
6. **Save**: Persist to localStorage and cloud (if auto-save enabled)
7. **Display Results**: Show success message with counts

## Merge Logic

When merging/syncing, the system:

1. **Matches by name**: Compares `First Name + Last Name` (case-insensitive)
2. **Updates all fields**: If match found, updates:
   - Club
   - Birth Year
   - Sex
   - SI Card Number
   - Phone (if XML had it)
   - Email (if XML had it)
3. **Preserves metadata**:
   - Runner ID stays the same
   - Usage statistics maintained
   - Last used timestamp updated
4. **Adds new runners**: If no match, creates new database entry

## Error Handling

The import handles various error cases:

- **Invalid XML**: Shows error if XML cannot be parsed
- **No runners found**: Shows error if no valid `<Competitor>` or `<PersonResult>` elements
- **Missing required fields**: Skips runners without first/last name
- **Malformed data**: Gracefully handles missing optional fields

## File Input Handling

- File input is cleared after each import attempt
- Allows importing the same file multiple times
- No file size limit (browser memory constraints apply)

## Cloud Sync Integration

If cloud sync is enabled and auto-save is on:
- The database is automatically saved to the cloud file after import
- No manual "Save to Cloud" click required

## Tips

- **Regular Syncing**: Use Merge mode to regularly sync with MeOS exports
- **Backup First**: The system creates automatic backups before major changes
- **Test Small**: Try importing a small XML file first to verify format
- **Check Results**: Review the runner count summary to ensure expected numbers
- **Search After Import**: Use the search box to verify specific runners were imported

## Troubleshooting

**No runners imported:**
- Check XML format matches IOF 3.0 standard
- Ensure `<Given>` and `<Family>` tags are present
- Verify file contains `<Competitor>` or `<PersonResult>` elements

**Wrong club names:**
- Add new organisation ID mappings in the code
- Or manually edit clubs after import

**Duplicate runners:**
- Check for name spelling variations (e.g., "Jon" vs "John")
- Merge mode only matches exact names (case-insensitive)
- Consider manual deduplication after import

## Code Location

**File:** `src/components/RunnerDatabaseManager.tsx`

**Key Functions:**
- `handleXMLImport()` - Triggers file selection and mode prompt
- `executeXMLImport(mode)` - Performs the actual import
- `promptImportMode()` - Shows the merge/replace modal

**Service:** `src/services/localRunnerService.ts`
- `addRunner()` - Handles merge logic (add or update)
- `clearAllRunners()` - Used in replace mode

## Future Enhancements

Potential improvements:
- Support for additional XML formats (OE, Condes)
- CSV import option
- Preview runners before importing
- Selective import (choose which runners to import)
- Duplicate detection with merge options
- Export to XML functionality
- Batch edit after import
