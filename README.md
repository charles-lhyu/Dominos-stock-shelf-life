# Stock dates

A makeline checker for Domino's stock. Import the latest expire datasheet, then scan a barcode or type an item code. The use-by date is shown straight away, with expired and due-soon stock called out.

Dates stay in this browser. Nothing is uploaded to a server.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4721](http://127.0.0.1:4721).

```bash
npm test
npm run lint
```

## Use it

1. The first visit loads a sample makeline sheet so a scan can be tried immediately. `DOUGH14`, `CHICK`, and barcode `5010000000201` are on that sheet.
2. Choose **Import sheet** and drop a `.csv` or `.xlsx` file. The app looks for an item code (or barcode) and a use-by column. Rename the mapping if the sheet uses different headings.
3. Click **Replace stock**. That becomes the sheet used for every search until you import a newer one.
4. Scan or type in the search box. A scanner works like a keyboard: it types the code and presses Enter. The next scan replaces the previous code.

Day/month/year is the default. `23/10/2026`, `23 Oct 2026`, `2026-10-23`, and Excel date cells are all read. A value such as `10/23/2026` is read as 23 October because 23 cannot be a month.

## Sheet columns

| Column | Required | Headings it recognises |
| --- | --- | --- |
| Item code | One of code or barcode | Item code, SKU, PLU, product code |
| Barcode | One of code or barcode | Barcode, EAN, UPC, GTIN |
| Use-by date | Yes | Use by, expiry, best before, BBD |
| Item name | No | Item name, description, product |
| Quantity, unit, location, batch, category | No | Qty, unit, location, batch, category |

An example file is at [`public/example-expire-sheet.csv`](public/example-expire-sheet.csv). **Download** writes the current sheet back to CSV.
