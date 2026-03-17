# Import / Export

## Where It Appears

- Leads: `Leads` page
- Opportunities: `Opportunities` page
- Contacts: `Contacts` page
- Buyers: `Cash Buyers CRM` page

Each page shows an **Import/Export** button in the header.

## Supported File Formats

- Import: CSV (`.csv`) and Excel (`.xlsx`, `.xls`)
- Export: CSV (`.csv`) and Excel (`.xlsx`)

## Import Behavior

- Upload the file, then the app previews headers + sample rows.
- The app suggests field mappings from common header synonyms.
- Required fields must be mapped.
- Duplicate handling modes:
  - `merge`: keep existing values, fill missing from incoming
  - `overwrite`: replace existing values with incoming values
  - `skip`: ignore incoming rows that match an existing record
- Validation runs row-by-row; errors are stored and downloadable as an error CSV.

## Duplicate Detection

Duplicates are detected using a computed `dedupe_key` per entity:

- Lead: `address|city|state|zip|ownerName`
- Opportunity: `apn|address|city|state|zip`
- Contact: `email|phone|name`
- Buyer: `email|phone|name|company`

## Export Behavior

- Exports run as background jobs.
- When complete, the UI shows a secure download link.
- Export links expire automatically.

## Data Types

- Numbers: parsed for integer/decimal fields
- Booleans (Buyers): accepts `true/false`, `yes/no`, `1/0`
- Arrays (Buyers): accepts comma/semicolon-separated lists (e.g. `Single Family, Land`)
- Dates (Buyers): accepts ISO date strings (e.g. `2026-03-17`)
