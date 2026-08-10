/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#18343B',
    tint: '#B86340',

    // Core surfaces
    background: '#F4EFE6',
    foreground: '#18343B',

    // Cards / elevated surfaces
    card: '#FFFDF8',
    cardForeground: '#18343B',

    // Primary action color (buttons, links, active states)
    primary: '#18343B',
    primaryForeground: '#FFFDF8',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8DED1',
    secondaryForeground: '#18343B',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#E8DED1',
    mutedForeground: '#617579',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#B86340',
    accentForeground: '#FFFDF8',

    // Destructive actions (delete, error states)
    destructive: '#A84339',
    destructiveForeground: '#FFFDF8',

    // Borders and input outlines
    border: '#D8C9BA',
    input: '#CBB9A9',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
