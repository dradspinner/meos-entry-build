# MeOS Sync Feature for JSON Import

## Overview

The MeOS Entry Build system now includes smart synchronization when importing JSON backup files. This feature automatically checks the current MeOS event status and updates local entries to reflect any changes that occurred in MeOS since the backup was created.

## How It Works

When you import a JSON backup file, the system will:

1. **Check MeOS Connection**: Test if MeOS is running and accessible
2. **Fetch Current Entries**: Retrieve all current entries from the MeOS event database
3. **Match Runners**: Compare backup entries with MeOS entries by name, club, and birth year
4. **Sync Status**: Update local entries with current MeOS status information

## What Gets Synced

### Runner Status
- **Check-in Status**: If a runner has been checked in to MeOS, their local status will be updated to "checked-in"
- **Submission Timestamps**: `submittedToMeosAt` and `checkedInAt` fields will be updated appropriately
- **MeOS Entry ID**: The system will store the MeOS entry ID for future reference

### Updated Information
- **Card Numbers**: If MeOS has assigned a different SI card number, it will be synced locally
- **Class Changes**: If a runner's class was changed in MeOS, it will be updated locally
- **Status Corrections**: Local pending entries will be marked as submitted if they exist in MeOS

## User Experience

### Import Messages
The import process will show enhanced status messages:

- ✅ **"Successfully imported 4 entries. ✅ 2 entries updated with current MeOS status"** - Some entries were synced
- ✅ **"Successfully imported 4 entries. ✅ All entries are in sync with MeOS"** - All entries match MeOS
- ⚠️ **"Successfully imported 4 entries. ⚠️ MeOS not available - status not checked"** - MeOS offline

### Console Logging
Detailed sync information is logged to browser console:
```
[JSON Import] Processing 4 entries from backup file
[JSON Import] Checking MeOS connection for status sync...
[JSON Import] Retrieved 5 entries from MeOS for status comparison
[JSON Import] Found John Smith in MeOS: {status: "OK", cardNumber: "123456", class: {...}}
[MeOS Sync] Marking Sarah Johnson as submitted (found in MeOS)
[JSON Import] Import complete: 4 imported, 2 updated from MeOS
```

## Technical Implementation

### Entry Matching Algorithm
The system matches entries using this priority:
1. **Exact Name + Club Match**: Most reliable matching method
2. **Exact Name + Birth Year Match**: When clubs don't match but names and birth years do
3. **Name Only Match**: When birth year information is unavailable

### Sync Logic
```javascript
// Example sync process
if (runnerFoundInMeos) {
  if (!localEntry.submittedToMeosAt) {
    localEntry.status = 'checked-in';
    localEntry.submittedToMeosAt = new Date();
    localEntry.checkedInAt = localEntry.checkedInAt || new Date();
  }
  
  // Update card number if MeOS has a better one
  if (meosEntry.cardNumber && localEntry.cardNumber === '0') {
    localEntry.cardNumber = meosEntry.cardNumber;
  }
}
```

## Benefits

### Event Management
- **Accurate Status**: Local backups stay synchronized with actual event status
- **Prevent Duplicates**: Know which runners are already in MeOS before attempting to submit
- **Real-time Sync**: Backup files automatically reflect current event state when imported

### Workflow Integration
- **Multi-Device Setup**: Import backups on different devices and get current status
- **Recovery Scenarios**: Restore from backup with confidence that status is current  
- **Event Day Flexibility**: Switch between devices while maintaining accurate entry status

## Usage Tips

### Best Practices
1. **MeOS Connection**: Ensure MeOS is running before importing for full sync benefits
2. **Backup Timing**: More recent backups will have fewer discrepancies to sync
3. **Review Logs**: Check console output to see which entries were updated

### Troubleshooting
- **No MeOS Connection**: Feature gracefully degrades - import works without sync
- **Name Mismatches**: Review console logs for entries that couldn't be matched
- **Multiple Matches**: System uses most reliable matching criteria (name + club)

## Testing

Use the provided test file `test-data/sample_backup_for_meos_sync_test.json` to test the feature:

1. Import the test JSON file
2. Observe sync messages and console logs  
3. Use "Test MeOS Sync" button to verify MeOS connectivity
4. Check imported entries for updated status information

## Future Enhancements

Potential improvements for this feature:
- **Batch Sync**: Sync all local entries with MeOS status (not just during import)
- **Conflict Resolution**: Handle cases where local and MeOS data conflict
- **Sync Direction**: Option to sync local changes back to MeOS
- **Partial Updates**: More granular field-level synchronization