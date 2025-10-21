// Application Constants

/**
 * Default fee for rental/hired SI cards
 * This fee is sent to MeOS to mark the card as hired
 * so volunteers are alerted to collect it after the race
 */
export const RENTAL_CARD_FEE = 5; // $5 rental fee

/**
 * Class order for display (color-coded courses)
 */
export const CLASS_DISPLAY_ORDER = [
  'White',
  'Yellow',
  'Orange',
  'Brown',
  'Green',
  'Red',
  'Blue'
] as const;
