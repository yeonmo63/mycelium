---
description: How to use the Farm-to-Sales Stock Conversion feature
---

# Farm-to-Sales Stock Management

## 1. Pre-requisites
- Go to **Settings > Product & Material Master**.
- Create **Raw Materials** (e.g., "Mushrooms (Bulk)") by selecting the "Material" tab.
- Create **Finished Products** (e.g., "Mushroom 1kg Box") by selecting the "Product" tab.
- **Link them**: In the Product setup, use the "Inventory Link" section to select the corresponding Material and set the ratio (e.g., Use 1 unit of Material to make 1 unit of Product).

## 2. Daily Harvest (Raw Material In)
1. Navigate to **Stock Control** (Inventory Management).
2. Select the **Agricultural Products (Material)** tab (Green icon).
3. Click the **Harvest Entry (수확 입고)** button.
4. Select the harvested item and enter the quantity.
5. This increases your raw material stock and logs it as a "Harvest" event.

## 3. Product Processing (Conversion)
1. Navigate to **Stock Control** (Inventory Management).
2. Select the **Sales Products (Finished)** tab (Indigo icon).
3. Click the **Processing (상품화)** button.
4. Select the finished product you are packing.
5. The system will automatically show the linked raw material and current stock.
6. Enter the quantity of finished goods to produce.
7. Click **Confirm**.
   - The system deducts the required amount of Raw Material.
   - The system adds the new Finished Products to inventory.
   - Logs are created for both the deduction (Material) and addition (Product).

## Troubleshooting
- **No Linked Material Error**: If you see this error, go back to Settings and ensure the Product is correctly linked to a Material.
- **Insufficient Stock**: You cannot convert more than your available raw material allows.
