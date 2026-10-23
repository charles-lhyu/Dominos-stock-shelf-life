import type { SectionId, ShelfRule } from "./types";

export const CHART = {
  title: "Campaign 5 shelf life chart",
  audience: "All stores",
  version: "Version 1",
  issued: "2026-09-07",
  validUntil: "2026-11-17",
};

export const SECTIONS: { id: SectionId; title: string; short: string; note: string }[] = [
  {
    id: "frozen",
    title: "Chilled (defrosted / frozen before use)",
    short: "Frozen before use",
    note: "Store in the walk-in or on the makeline. Do not use until fully defrosted.",
  },
  {
    id: "chilled",
    title: "Chilled items",
    short: "Chilled",
    note: "",
  },
  {
    id: "ready",
    title: "Chilled — ambient before use",
    short: "Ambient before use",
    note: "",
  },
  {
    id: "ambient",
    title: "Ambient items",
    short: "Ambient",
    note: "",
  },
  {
    id: "pack",
    title: "Dated on the original packaging",
    short: "On the pack",
    note: "Use the use-by or best-before date printed on the pack.",
  },
];

export const FOOTNOTES = [
  "Follow the shelf life and storage information provided by DPG.",
  "Opened, prepped and in-use dates must not go past the use-by or best-before date on the original packaging.",
  "Stock the top of the make-line with no more than 2 hours of product.",
];

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function group(
  sectionId: SectionId,
  category: string,
  names: string[],
  life: Partial<
    Pick<
      ShelfRule,
      | "fromDelivery"
      | "inUse"
      | "unopened"
      | "prepped"
      | "ambientUse"
      | "also"
      | "note"
    >
  >,
  aliases: Record<string, string[]> = {},
): ShelfRule[] {
  return names.map((name) => ({
    id: `${sectionId}:${slug(name)}`,
    sectionId,
    category,
    name,
    aliases: aliases[name] ?? [],
    sameAs: names.filter((other) => other !== name),
    ...life,
  }));
}

const chilledOpen =
  "Once open, keep wrapped. This life applies while it stays chilled. If it has been ambient, do not return it to the chill — use it within 24 hours.";

export const RULES: ShelfRule[] = [
  ...group("frozen", "Toppings", ["Pepperoni", "Chorizo", "Nduja Sausage"], {
    fromDelivery: "12 days",
  }, { "Nduja Sausage": ["nduja"] }),
  ...group("frozen", "Toppings", ["Tandoori Chicken"], { fromDelivery: "10 days" }, {
    "Tandoori Chicken": ["tandoori"],
  }),
  ...group("frozen", "Toppings", ["Bacon (FROZEN)"], {
    fromDelivery: "10 days",
    inUse: "7 days",
    note: "You will be notified by Supply Chain if you are due to receive frozen bacon.",
  }, { "Bacon (FROZEN)": ["frozen bacon", "bacon frozen"] }),
  ...group("frozen", "Toppings", ["NEW Chinese Style Chicken"], {
    fromDelivery: "9 days",
  }, { "NEW Chinese Style Chicken": ["chinese chicken", "chinese style chicken"] }),
  ...group(
    "frozen",
    "Toppings",
    ["Beef", "Chicken", "Hot Dog Slices", "Meatballs"],
    { fromDelivery: "9 days" },
    { "Hot Dog Slices": ["hot dog", "hotdog"] },
  ),
  ...group("frozen", "Toppings", ["Sausage"], { fromDelivery: "6 days" }),
  ...group(
    "frozen",
    "Sides",
    ["Chicken Strippers", "Chicken Kickers", "Chicken Tenders", "Chicken Boneless Bites"],
    {
      fromDelivery: "10 days",
      note: "Tender and boneless updated to 10 days.",
    },
    {
      "Chicken Strippers": ["strippers"],
      "Chicken Kickers": ["kickers"],
      "Chicken Tenders": ["tenders"],
      "Chicken Boneless Bites": ["boneless", "boneless bites"],
    },
  ),
  ...group("frozen", "Sides", ["Chicken Wings"], {
    fromDelivery: "9 days",
    note: "Prepped life is the remaining life of the wings, not a new clock.",
  }, { "Chicken Wings": ["wings"] }),
  ...group("frozen", "Sides", ["Potato Wedges"], { fromDelivery: "7 days" }, {
    "Potato Wedges": ["wedges"],
  }),
  ...group("frozen", "Sides", ["Fries"], { fromDelivery: "7 days" }),
  ...group("frozen", "Desserts", ["Mac n Cheese"], {
    fromDelivery: "6 days",
    inUse: "48 hours prepped",
  }, { "Mac n Cheese": ["mac and cheese", "macaroni cheese"] }),
  ...group("frozen", "Desserts", ["Double Chocolate & Caramel Cookies"], {
    fromDelivery: "14 days",
  }, { "Double Chocolate & Caramel Cookies": ["double chocolate cookies", "caramel cookies"] }),
  ...group("frozen", "Desserts", ["Dominos Cookies with Creme Egg"], {
    fromDelivery: "14 days",
  }, { "Dominos Cookies with Creme Egg": ["creme egg", "cream egg"] }),
  ...group("frozen", "Desserts", ["Cookies"], { fromDelivery: "17 days" }),
  ...group("frozen", "Cheese", ["Cheese String - Garlic & Herb"], {
    fromDelivery: "7 days",
    note: "Keep stored in a clean, sanitised and lidded container.",
  }, { "Cheese String - Garlic & Herb": ["cheese string", "garlic herb"] }),
  ...group("frozen", "Cheese", ["Goats Cheese"], { fromDelivery: "14 days" }, {
    "Goats Cheese": ["goat cheese", "goats cheese"],
  }),
  ...group("frozen", "Bases", ["Thin Crust Shells (All sizes)"], {
    fromDelivery: "21 days",
    note: chilledOpen,
  }, { "Thin Crust Shells (All sizes)": ["thin crust", "thin and crispy"] }),
  ...group("frozen", "Bases", ["Wraps"], {
    fromDelivery: "22 days",
    note: chilledOpen,
  }),

  ...group("chilled", "Toppings", ["Pepperoni"], {
    unopened: "Date on pack",
    prepped: "12 days",
  }),
  ...group("chilled", "Toppings", ["Bacon", "Ham"], {
    unopened: "Date on pack",
    prepped: "6 days",
  }),
  ...group(
    "chilled",
    "Toppings",
    ["Green Chillies", "Mushrooms", "Onions", "Peppers", "Tomatoes"],
    { unopened: "Date on pack", prepped: "48 hours" },
    {
      "Green Chillies": ["chillies", "chilies", "green chilli"],
      Mushrooms: ["mushroom"],
      Onions: ["onion"],
      Peppers: ["pepper"],
      Tomatoes: ["tomato", "cherry tomatoes"],
    },
  ),
  ...group(
    "chilled",
    "Cheese",
    ["Mozzarella Cheese - Standard", "Mozzarella Cheese - Delight"],
    { unopened: "Date on pack", prepped: "9 days" },
    {
      "Mozzarella Cheese - Standard": ["mozzarella", "mozz"],
      "Mozzarella Cheese - Delight": ["mozzarella delight", "delight"],
    },
  ),
  ...group("chilled", "Cheese", ["Plant-Based Cheese Alternative"], {
    unopened: "Date on pack",
    prepped: "7 days",
  }, {
    "Plant-Based Cheese Alternative": ["vegan cheese", "plant based", "plant-based"],
  }),
  ...group("chilled", "Sauces", ["Garlic Butter"], {
    unopened: "Date on pack",
    prepped: "10 days",
    also: { label: "12 hours", value: "12 hours" },
  }, { "Garlic Butter": ["garlic butter"] }),
  ...group("chilled", "Sauces", ["Liquid Cheese"], {
    unopened: "Date on pack",
    prepped: "6 days",
  }),
  ...group("chilled", "Bases", ["Prepared Double Decadence bases"], {
    unopened: "N/A",
    prepped: "12 hours chilled",
    also: { label: "At ambient", value: "4 hours at ambient" },
    note: "12 hours includes 4 hours at ambient, i.e. 8 hours chilled + 4 hours ambient. Do not return the product to the chill after 4 hours — discard what is left.",
  }, { "Prepared Double Decadence bases": ["decadence", "double decadence"] }),
  ...group("chilled", "Dough", ["Standard Dough (All sizes)"], {
    unopened: "Date on tray",
    prepped: "BB date on tray +1 day",
    note: "Follow the dough proofing chart. Day 6 dough must be in good condition for use.",
  }, { "Standard Dough (All sizes)": ["dough"] }),

  ...group(
    "ready",
    "Sauces",
    ["Pizza Sauce", "Pizza Sauce Pre-Bake Drizzle", "BBQ sauce"],
    {
      unopened: "Date on pack",
      prepped: "10 days",
      ambientUse: "15 hours",
      note: "Store ambient until prepped.",
    },
    {
      "Pizza Sauce Pre-Bake Drizzle": ["pre bake", "prebake", "pre-bake"],
      "BBQ sauce": ["bbq", "barbecue"],
    },
  ),
  ...group("ready", "Sauces", ["Sundried Tomato and Garlic"], {
    unopened: "Date on pack",
    prepped: "10 days",
    ambientUse: "12 hours",
    note: "Store ambient until prepped.",
  }, { "Sundried Tomato and Garlic": ["sundried", "sun dried tomato"] }),
  ...group("ready", "Sauces", ["Cheese Sauce"], {
    unopened: "Date on pack",
    prepped: "8 days",
    ambientUse: "15 hours",
    note: "Store ambient until prepped.",
  }),
  ...group("ready", "Toppings", ["Sliced Gherkins"], {
    unopened: "Date on pack",
    prepped: "16 days",
    ambientUse: "N/A",
    note: "Must be kept in brine. Store ambient until prepped.",
  }, { "Sliced Gherkins": ["gherkins", "gherkin"] }),
  ...group("ready", "Toppings", ["Sweetcorn", "Jalapenos Green"], {
    unopened: "Date on pack",
    prepped: "11 days",
    ambientUse: "N/A",
    note: "Store ambient until prepped.",
  }, {
    Sweetcorn: ["sweet corn"],
    "Jalapenos Green": ["jalapeno", "jalapeño", "jalapenos"],
  }),
  ...group("ready", "Toppings", ["Pepperdew Piquante Peppers"], {
    unopened: "Date on pack",
    prepped: "25 days",
    ambientUse: "N/A",
  }, { "Pepperdew Piquante Peppers": ["pepperdew", "piquante"] }),
  ...group("ready", "Toppings", ["Pineapple", "Olives"], {
    unopened: "Date on pack",
    prepped: "10 days",
    ambientUse: "N/A",
    note: "Store ambient until prepped.",
  }, { Olives: ["olive"] }),
  ...group("ready", "Toppings", ["Tuna"], {
    unopened: "Date on pack",
    prepped: "6 days",
    ambientUse: "N/A",
    note: "Store ambient until prepped.",
  }),

  ...group("ambient", "Sauces", ["Burger Sauce"], {
    unopened: "Date on pack",
    prepped: "14 days",
    note: "Keep ambient.",
  }),
  ...group("ambient", "Sauces", ["Pesto Drizzle"], {
    unopened: "Date on pack",
    prepped: "21 days",
    note: "Keep ambient. Note change in Campaign 5.",
  }, { "Pesto Drizzle": ["pesto"] }),
  ...group("ambient", "Sauces", ["Habanero Hot Honey"], {
    unopened: "Date on pack",
    prepped: "35 days",
    note: "Keep ambient.",
  }, { "Habanero Hot Honey": ["hot honey", "habanero"] }),
  ...group("ambient", "Toppings", ["NEW Biscoff Crumb"], {
    unopened: "Date on pack",
    prepped: "30 days",
  }, { "NEW Biscoff Crumb": ["biscoff", "lotus"] }),
  ...group("ambient", "Cornmeal", ["Cornmeal"], {
    unopened: "Date on pack",
    prepped: "BB date on pack",
    note: "Date the cornmeal tub with the BB date from the original packaging.",
  }),

  ...group(
    "pack",
    "Other",
    [
      "Franks Hot Sauce",
      "Butter Whirl",
      "Coleslaw",
      "Salt Sachets",
      "Ketchup Sachets",
      "Dips Pots",
      "Chick'N'Dip Dip Pots (inc. NEW Ranch Dip)",
      "Herbs",
      "Dr Schar Gluten Free Pizza Base",
      "Drinks",
      "Ice Cream",
      "Milk",
      "Chocolate Disc",
      "NEW White Chocolate Disc",
      "Cinnamon Sugar",
      "Tortilla Chips (Nachos)",
    ],
    { unopened: "Date on pack" },
    {
      "Franks Hot Sauce": ["franks", "frank's"],
      "Chick'N'Dip Dip Pots (inc. NEW Ranch Dip)": ["chick n dip", "ranch dip", "ranch"],
      "Dr Schar Gluten Free Pizza Base": ["gluten free", "gluten-free", "schar"],
      "NEW White Chocolate Disc": ["white chocolate", "chocoate"],
      "Chocolate Disc": ["chocolate disc"],
      "Tortilla Chips (Nachos)": ["nachos", "tortilla"],
      "Ice Cream": ["ice cream"],
      "Cinnamon Sugar": ["cinnamon"],
    },
  ),
];

export function sectionById(id: SectionId) {
  const section = SECTIONS.find((item) => item.id === id);
  if (!section) throw new Error(`Unknown section ${id}`);
  return section;
}
