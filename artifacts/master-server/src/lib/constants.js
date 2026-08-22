export const INVENTORY_TYPES = ['rotational', 'consumable', 'tool'];

export const ROTATIONAL_STATUSES = [
  'available',
  'issued',
  'empty',
  'awaiting_collection',
  'returned',
  'damaged',
  'missing',
  'retired',
];

export const TOOL_STATUSES = [
  'available',
  'checked_out',
  'reserved',
  'overdue',
  'maintenance',
  'damaged',
  'missing',
  'retired',
];

export const PERMISSIONS = [
  'users.manage',
  'devices.manage',
  'categories.manage',
  'products.manage',
  'inventory.view',
  'inventory.issue',
  'inventory.return',
  'inventory.add',
  'inventory.adjust',
  'inventory.take',
  'tools.checkout',
  'tools.return',
  'locations.manage',
  'settings.manage',
  'audit.view',
  'reports.view',
  'reports.export',
  'pairing.manage',
  'permissions.manage',
  'labels.manage',
  'nfc.manage',
  'alerts.manage',
];

export const ROLE_PRESETS = {
  administrator: PERMISSIONS.slice(),
  supervisor: [
    'inventory.view',
    'inventory.issue',
    'inventory.return',
    'inventory.add',
    'inventory.adjust',
    'inventory.take',
    'tools.checkout',
    'tools.return',
    'products.manage',
    'reports.view',
    'reports.export',
    'audit.view',
    'labels.manage',
  ],
  standard_user: [
    'inventory.view',
    'inventory.take',
    'inventory.return',
    'tools.checkout',
    'tools.return',
  ],
};
