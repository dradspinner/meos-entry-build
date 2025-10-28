# Multi-Class Runner Feature

## Overview
This feature allows runners to be registered for multiple classes at the same event. Each class registration is tracked separately, including its check-in status.

## Key Features

### 1. Data Model
- **ClassRegistration interface**: Tracks individual class registrations with their own status, check-in time, and MeOS submission details
- **LocalEntry extension**: Added `additionalClasses` array to store multiple class registrations per runner
- Backward compatible with existing single-class entries

### 2. Service Methods (localEntryService)

#### `addAdditionalClass(id: string, classRegistration: ClassRegistration)`
- Adds a new class registration to an existing entry
- Prevents duplicate class registrations
- Returns the updated entry

#### `checkInEntryForClass(id: string, classId: string, cardNumber?: string)`
- Checks in a runner for a specific class
- Supports both primary and additional classes
- Updates card number if provided

#### `getEntryClasses(entry: LocalEntry)`
- Returns all classes (primary + additional) for an entry
- Useful for displaying all registrations

#### `hasMultipleClasses(entry: LocalEntry)`
- Quick check if a runner is registered for multiple classes

### 3. Same Day Registration UI

#### Adding Runner to Additional Class
1. Open Same Day Registration modal
2. Click "Search for existing runner" link at the top
3. Search by name or club
4. Select the runner from search results
5. Alert shows current class registrations
6. Select new class from dropdown
7. Click "Add to Class & Check In"

#### Registering New Runner with Multiple Classes
1. Open Same Day Registration modal
2. Enter runner details (name, club, etc.)
3. Select primary class
4. Click "Add another class" link below the class dropdown
5. Select additional class(es)
6. Classes shown as tags below the dropdown
7. Click "Register & Check In" - runner checked in for all classes

**Features:**
- Visual indication when in "additional class mode"
- Shows all current class registrations with status
- Button text changes to "Add to Class & Check In"
- "Save (No Check-In)" button hidden in additional class mode

### 4. Edit Entry Dialog

#### Managing Classes in Edit Mode
When editing an existing entry:
1. Click "Edit" on any entry in the entry list
2. Edit dialog shows:
   - Primary class dropdown (labeled "Primary Class")
   - "Additional Classes" section showing:
     - Existing additional classes with status tags
     - New classes to add (orange tags, removable)
   - "Add Another Class" button
3. Click "Add Another Class" to add more classes
4. Select from class dropdown
5. Remove unwanted classes by clicking X on tags
6. Click "Save" to update entry with new classes
7. Click "Check In" to save and check in

**Features:**
- Visual separation between primary and additional classes
- Shows status of existing classes (pending/checked-in)
- **Click X on class tags to remove** (only if not checked in)
- Preview new classes before saving
- Validation prevents duplicate class assignments
- Change primary class freely if not checked in
- Checked-in classes cannot be removed (shows warning)

### 5. Event Day Check-In UI

#### Multi-Class Check-In
When a runner with multiple classes is selected:
1. Alert displays all class registrations
2. Each class shown as a clickable tag:
   - Green: Already checked in
   - Blue: Selected for check-in
   - Default: Pending
3. Click on a pending class to select it for check-in
4. Card number applies to all classes (same runner, same card)
5. Check-in button processes the selected class only

**Features:**
- Visual class status indicators
- Click-to-select class for check-in
- Shows which class will be checked in
- After checking in for one class, runner can be checked in again for their other class(es)

## Event Day Dashboard Table

### Multi-Class Display
The main event day dashboard table shows runners with multiple classes as **separate rows**:

- **One row per class registration** - if a runner is in 2 classes, they appear as 2 rows
- **Single Edit button** - appears only on the first row for each runner
- **Per-class Delete button** - each row has its own Delete button:
  - **Cannot delete checked-in classes** - must uncheck-in first
  - If runner has multiple classes: "Remove from [ClassName]?" - removes only that class
  - If runner has only one class: "Delete [Name]?" - removes entire entry
  - Automatically promotes another class to "primary" if you delete the current primary
- **Per-class Check In button** - each row has its own Check In button
  - Checks in the runner for that specific class only
  - After running first class, use the second row's Check In button for their next class
- **Per-class Status** - each row shows independent status (Pending/Checked In)

**Important:** There is no hierarchy between classes. Any class can be removed or changed as long as it's not already checked in.

**Example:**
```
Name    | Class  | Status      | Actions
--------|--------|-------------|------------------
John    | Orange | Checked In  | Edit | Delete | Uncheck-In
John    | Green  | Pending     | Delete | Check In
```

## Usage Workflow

### Scenario 1: Register runner for second class at registration time
1. Runner registers for first class normally
2. While still at registration, search for them in Same Day Registration
3. Select their existing entry
4. Choose second class
5. Check them in for second class

### Scenario 2: Register runner for second class at check-in time
1. Runner already registered for one class
2. At check-in, they want to add a second class
3. Use Same Day Registration to find them
4. Add second class and check in

### Scenario 3: Check in multi-class runner
1. Runner registered for multiple classes arrives
2. Use Event Day Check-In (Pre-reg scenarios)
3. Search for runner
4. Select which class to check in (first run)
5. After their first run, use same process to check them in for second class

## Technical Notes

### Data Structure
```typescript
interface ClassRegistration {
  classId: string;
  className: string;
  fee: number;
  status: 'pending' | 'checked-in' | 'started' | 'finished';
  checkedInAt?: Date;
  submittedToMeosAt?: Date;
  meosEntryId?: string;
}

interface LocalEntry {
  // ... existing fields ...
  additionalClasses?: ClassRegistration[];
}
```

### Backward Compatibility
- Existing entries without `additionalClasses` work normally
- Primary class fields (classId, className, status, etc.) maintained
- No migration needed for existing data

### Check-In Logic
- Single-class runners: Use existing `checkInEntry()` method
- Multi-class runners: Use `checkInEntryForClass(id, classId)` method
- Card number updated on entry level (shared across all classes)
- Each class maintains its own check-in timestamp and status

## Testing Checklist

- [x] Add runner to second class via Same Day Registration
- [x] Search and select existing runner
- [x] Display current class registrations
- [x] Check in for first class
- [x] Check in for second class separately
- [x] Visual indicators show correct status
- [x] Class selection works in Event Day Check-In
- [ ] Test with more than 2 classes
- [ ] Test MeOS submission for multi-class runners
- [ ] Test with rental cards for multi-class runners

## Future Enhancements

1. **Bulk Multi-Class Registration**: Allow importing CSV with runners in multiple classes
2. **Class Switching**: Allow moving a runner from one class to another
3. **Multi-Class Reports**: Show statistics for multi-class runners
4. **Auto-suggest classes**: Based on age/gender, suggest compatible additional classes
