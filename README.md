# My Kitchen

A small web app to know what's in my kitchen and decide what to cook: a pantry, a grocery list, and recipe ideas made from what I already have, using Claude.

**👉 Try the app: https://emmanueltran.github.io/my-kitchen/**

## Features

- **Pantry**: everything in the fridge, freezer and cupboards, with quantities, +/− buttons and a "use first" flag. Staples (salt, oil, spices) are listed but never deducted.
- **Grocery list linked to the pantry**: ticking an item once it's in the basket moves it straight into the pantry. Running out of something offers to add it to the list.
- **Recipe ideas**: choose how much time you have and an optional craving, and Claude suggests 3 dishes based on the pantry, your tastes, your equipment and your past ratings.
- **"I cooked this"**: removes the ingredients used from the pantry (amounts can be adjusted), and logs the dish with a rating ("Loved it", "Not again") that shapes later suggestions.
- **Photo scan**: a photo of the fridge or a receipt fills the pantry (needs an API key).
- **Favourites, undo, English or French recipes**, mobile layout and automatic dark mode.

## How Claude is used

The site is static, so there are two ways to get suggestions:

1. **API key** (one tap): paste an [Anthropic API key](https://console.anthropic.com/) in the *Me* tab. It is stored only in the browser and sent only to `api.anthropic.com`. Usage is billed to that account.
2. **Copy-paste** (free with a Claude subscription): *Copy request for Claude* copies the full prompt (pantry, tastes, constraints); paste it into Claude, then paste the answer back into the app.

In both cases Claude returns structured JSON (title, time, ingredients linked to pantry items with the amount used, missing items, steps). This link between ingredients and pantry items is what lets the app deduct exactly what was used.

## How it's built

```
├── index.html   # page structure
├── styles.css   # responsive layout and dark mode
└── app.js       # logic: pantry, groceries, prompts, Claude calls, storage
```

HTML, CSS and JavaScript, with no framework or build step. Data is saved in the browser (`localStorage`); the *Me* tab exports and imports a backup file to move it to another device. Hosted for free on GitHub Pages.

## Run locally

```bash
python -m http.server 8000
# then open http://localhost:8000
```
