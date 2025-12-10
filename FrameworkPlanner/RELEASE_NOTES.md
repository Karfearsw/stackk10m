# Release Notes - Pipeline & Opportunity Updates

## 🚀 New Features

### Pipeline Visualization
- **New Pipeline Bar**: Added a visual pipeline indicator on the Dashboard showing real-time counts for Lead, Negotiation, Contract, and Closed stages.
- **Stage Tracking**: Opportunities now display their current stage with visual progress bars.

### Lead-to-Opportunity Automation
- **Auto-Conversion**: Leads moved to "Negotiation" or "Contract" status are automatically converted to Opportunities.
- **Data Preservation**: All lead details (address, price, notes) are preserved during conversion.
- **Audit Logging**: System automatically logs these conversions in the global activity feed.

### Terminology Updates
- **"Properties" → "Opportunities"**: Renamed throughout the UI to better reflect the sales pipeline nature of the business.
- **Backward Compatibility**: Legacy API endpoints (`/api/properties`) remain fully functional to support existing integrations.

## 🛠 Technical Improvements
- **Performance**: Added database indexes on status columns for faster pipeline counts.
- **Testing**: Added integration tests for new Opportunity endpoints and pipeline movement.
- **Architecture**: Implemented a background worker pattern for automation tasks.

## 📋 User Guide

### How to use the new Pipeline
1. **Dashboard**: View the new Pipeline Bar at the top of your dashboard to see deal flow.
2. **Opportunities Page**: Use the "Add Opportunity" button to manually create deals, or let the automation handle it.
3. **Moving Stages**: Edit an opportunity and change its status to move it through the pipeline. The progress bar on the card will update automatically.
