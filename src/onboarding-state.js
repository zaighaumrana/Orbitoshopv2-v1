export function needsOnboarding(session, config) {
  return session?.employee?.role === 'Business Owner' && !session.isSupportAdmin &&
    config.onboarding_version === 2 && !config.onboarding_completed_at
}

export function managedFeatures(config) {
  return [
    ['Repair', config.repair_module_enabled === true],
    ['Inventory', config.inventory_module_enabled === true],
    ['Technician / Workshop', config.technician_module_enabled === true],
    ['Live Tracking', config.live_tracking_enabled === true],
    ['EMS', config.ems_enabled === true],
    ['Break Tracking', config.ems_enabled === true && config.ems_track_breaks === true],
    ['Printing & Thermal Tracking', true],
    ['Paper Resupply', config.paper_resupply_enabled === true],
  ]
}
