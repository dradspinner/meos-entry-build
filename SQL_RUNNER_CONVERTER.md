# SQL Runner Database Converter

## Overview

The SQL Runner Database Converter is a utility tool that converts DVOA SQL runner database exports (XML format) into IOF XML 3.0 format compatible with the MeOS Entry Build Runner Database system.

## Features

- **Direct Conversion**: Converts SQL database XML exports to IOF XML 3.0 format
- **Comprehensive Data**: Preserves runner information including:
  - First and last names
  - Birth year
  - Gender (M/F)
  - Club name and ID
  - All runners (members and non-members)
- **Data Cleaning**: Automatically cleans and formats data:
  - Removes commas from year of birth (e.g., "1,954" → "1954")
  - Validates gender values
  - Handles missing or empty fields gracefully
- **Two-Way Workflow**:
  1. Download converted IOF XML file for backup/archiving
  2. Import directly into Runner Database for immediate use

## Usage

### Accessing the Tool

1. Launch the MeOS Entry Build application
2. From the Dashboard, click **"Launch Tools"** in the Tools & Utilities card
3. Find the **SQL Runner Database Converter** section

### Converting a Database File

1. Click **"Select SQL Database File to Convert"**
2. Choose your SQL runner database XML export file
3. Wait for conversion to complete (typically a few seconds)
4. Review the conversion summary:
   - Total runners converted
   - Any errors or skipped records

### Options After Conversion

#### Option 1: Download IOF XML File
- Click **"Download IOF XML File"**
- Save the converted file to your preferred location
- Use this file for:
  - Backup and archival purposes
  - Importing into other systems that support IOF XML 3.0
  - Manual review and editing

#### Option 2: Import Directly to Runner Database
- Click **"Import to Runner Database"**
- Confirm the import operation
- The converted runners will be merged into your Runner Database:
  - New runners are added
  - Existing runners are updated with the latest data
  - No existing runners are deleted
- After import, you can immediately use the Runner Database for event entries

## Input Format

The converter expects XML files exported from the DVOA SQL database with the following structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<result_runner>
  <DATA_RECORD>
    <id>1</id>
    <mmbr_id>3</mmbr_id>
    <fname>John</fname>
    <lname>Smith</lname>
    <name>John Smith</name>
    <sex>M</sex>
    <yob>1,985</yob>
    <club_id>23</club_id>
    <club_name>DVOA</club_name>
    <!-- Additional fields -->
  </DATA_RECORD>
  <!-- More DATA_RECORD elements -->
</result_runner>
```

## Output Format

The converter generates IOF XML 3.0 format:

```xml
<?xml version="1.0" encoding="UTF-8"?>

<CompetitorList xmlns="http://www.orienteering.org/datastandard/3.0" 
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                iofVersion="3.0" 
                createTime="2025-10-27T15:00:00Z" 
                creator="MeOS Entry Build - SQL Runner Database Converter">
  <Competitor>
    <Person sex="M">
      <Name>
        <Given>John</Given>
        <Family>Smith</Family>
      </Name>
      <BirthDate>1985-01-01</BirthDate>
    </Person>
    <Organisation>
      <Id>23</Id>
      <Name>DVOA</Name>
    </Organisation>
  </Competitor>
  <!-- More Competitor elements -->
</CompetitorList>
```

## Error Handling

The converter handles various data issues gracefully:

- **Missing Names**: Records without both first and last names are skipped
- **Invalid Gender**: Empty or invalid gender values are omitted
- **Missing Birth Year**: Records without birth year still convert (birth year is optional)
- **Missing Club**: Records without club information still convert
- **Duplicate Records**: The Runner Database's merge function handles duplicates automatically

## Technical Details

### Components

1. **sqlRunnerDatabaseConverter.ts** - Core conversion service
   - Parses SQL database XML structure
   - Generates IOF XML 3.0 format
   - Handles file I/O operations

2. **Tools.tsx** - User interface component
   - File selection and upload
   - Conversion progress tracking
   - Result display and actions

3. **Integration** - Seamless integration with existing systems
   - Uses iofRunnerDatabaseService for imports
   - Compatible with existing Runner Database module
   - Maintains data consistency across the application

### File Locations

```
src/
├── services/
│   └── sqlRunnerDatabaseConverter.ts  # Conversion service
├── components/
│   └── Tools.tsx                       # Tools UI component
└── App.tsx                             # Updated with Tools route
```

## Best Practices

1. **Backup First**: Always download the converted IOF XML file before importing
2. **Review Results**: Check the conversion summary for any skipped records
3. **Test Import**: If converting for the first time, test with a small sample first
4. **Regular Updates**: Re-convert and import your SQL database periodically to keep runner data current

## Troubleshooting

### No Records Converted
- **Check File Format**: Ensure the file contains `<DATA_RECORD>` elements
- **Verify XML Structure**: Make sure the XML is well-formed (no syntax errors)
- **Look for Names**: Records must have at least a first or last name

### Some Records Skipped
- Review the error messages in the "Records Skipped" section
- Common reasons:
  - Missing names (both first and last name empty)
  - Malformed XML in that specific record

### Import Fails
- Ensure you have enough browser storage space
- Check browser console for detailed error messages
- Try downloading the file first and importing manually through the Runner Database module

## Future Enhancements

Planned improvements for future versions:
- Support for additional database formats
- Batch conversion of multiple files
- Advanced filtering options (by club, date range, etc.)
- Data validation and cleanup rules
- Export to other formats (CSV, JSON, etc.)

## Support

For issues or questions about the SQL Runner Database Converter:
1. Check this documentation first
2. Review the console logs for detailed error messages
3. Contact the DVOA technical team with:
   - Screenshot of the error
   - Sample file (if possible)
   - Browser and version information
