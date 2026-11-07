/** Shared how-to content for README and in-app Help. */

export type HelpTopic = {
  id: string;
  title: string;
  /** Short paragraphs or bullet lines shown in order. */
  points: string[];
};

export const HELP_GUIDE: HelpTopic[] = [
  {
    id: "start",
    title: "Get started",
    points: [
      "Open Settings (gear) and set your Store ID so this device keeps dates, hidden items, and defaults for that store.",
      "Import a shelf-life chart under Settings → Import: pick a PDF, paste a Google Drive link, or Scan QR.",
      "Public Drive files shared as “Anyone with the link” load straight away. Private files ask you to sign in with Google so the app can download the PDF.",
    ],
  },
  {
    id: "dates",
    title: "Delivery date and prep time",
    points: [
      "Set the delivery (or prep) date at the top of the list. That date is day 1 of day-based shelf lives.",
      "Prep time is used for hour lives (sauces, some sides). Lock a time or leave it live on the store clock.",
      "Tap a use-by date on the list or card to switch between long and short date formats.",
    ],
  },
  {
    id: "browse",
    title: "Find a product",
    points: [
      "Scroll the chart list, filter by category or storage, or type in search.",
      "Tap a product to open item details. Use Back to return to the list.",
      "Storage and life tags (Delivery / Prepped / Ambient) change which use-by is shown. Multi-storage items can save a default storage for the store.",
    ],
  },
  {
    id: "details",
    title: "Item details",
    points: [
      "Each life on the card shows the chart value and the calculated use-by from the date you set.",
      "Same life names on the chart row are tappable so you can jump to a sibling product.",
      "When a use-by can be calculated, Same use-by lists other products that share that calendar day, with a storage tag and remaining days.",
    ],
  },
  {
    id: "store",
    title: "Store data",
    points: [
      "Hide items you do not use; show them again from Settings → App / Store tools.",
      "Stored data can copy settings between stores, and import or export a backup file.",
      "Changing Store ID may ask whether to keep what is on screen or load what that store already saved.",
    ],
  },
  {
    id: "display",
    title: "Display and system",
    points: [
      "Settings → Display controls list layout (compact tags), text size, and keep-awake options.",
      "Settings → System shows the app version, Share app (QR and link), Changelog, and Check for updates.",
      "Settings → Help (after System) has this guide in the app.",
      "Live app: https://charles-lhyu.github.io/Dominos-stock-shelf-life/",
    ],
  },
];

/** Markdown body for README (topics only — no surrounding title). */
export function helpGuideMarkdown(): string {
  return HELP_GUIDE.map((topic) => {
    const lines = topic.points.map((point) => `- ${point}`).join("\n");
    return `### ${topic.title}\n\n${lines}`;
  }).join("\n\n");
}
