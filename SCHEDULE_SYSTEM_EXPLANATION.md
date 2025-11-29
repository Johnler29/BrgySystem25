# Schedule System Explanation

## How Schedules Work

### Current Behavior:
1. **Each submission = One record**
   - When a resident submits a schedule preference, it creates ONE new record in the database
   - Each record has a unique ID and tracks one schedule request

2. **Status progression:**
   - **Pending** - Initial status when resident submits
   - **Scheduled** - Admin confirms the schedule
   - **Completed** - Checkup is finished
   - **Cancelled** - Schedule is cancelled

3. **Multiple schedules = Multiple records**
   - If a resident submits 3 different schedule requests, they will see 3 separate records
   - Each record can have a different status
   - Example:
     - Record 1: Pre-natal checkup (Status: Completed)
     - Record 2: Infant checkup (Status: Scheduled)
     - Record 3: Health checkup (Status: Pending)

### What happens when a schedule is "finished" (Completed)?

✅ **The SAME record is updated** - The status field changes from "Pending" or "Scheduled" to "Completed"
❌ **NO new record is created** - The existing record is just updated

### Example Timeline:

1. **Day 1:** Resident submits "Pre-natal Checkup" for Jan 15
   - Creates Record #1 with status: "Pending"

2. **Day 2:** Admin confirms the schedule
   - Updates Record #1: status → "Scheduled"

3. **Day 15:** Checkup happens
   - Updates Record #1: status → "Completed"
   - Adds `completedAt` timestamp

4. **Result:** Resident sees ONE record with status "Completed"

## Database Structure

Each schedule record contains:
- `_id` - Unique identifier
- `type` - prenatal, infant, health, general
- `preferredDate` - Original requested date
- `preferredTime` - Original requested time
- `status` - Pending, Scheduled, Completed, Cancelled
- `residentUsername` - Who submitted it
- `createdAt` - When it was submitted
- `updatedAt` - Last update time
- `completedAt` - When status changed to Completed (if applicable)
- `confirmedDate` - Admin-confirmed date (if different from preferred)
- `confirmedTime` - Admin-confirmed time (if different from preferred)

## Answer to Your Question

**"Will I only get one record if my schedule is finished?"**

**YES!** ✅
- Each schedule submission creates ONE record
- When the schedule is completed, that SAME record's status is updated to "Completed"
- You will see ONE record per schedule submission, regardless of status

**If you submit multiple schedules:**
- You'll see multiple records (one per submission)
- Each can have a different status
- When each is completed, its status updates to "Completed"

