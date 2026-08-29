import { USER_ROLES } from '../constants/config';

export const mapUsertypeToRole = (usertype) => {
  const code = String(usertype || '').trim().toUpperCase();
  if (code === 'M') return USER_ROLES.MECHANIC;
  if (code === 'E') return USER_ROLES.ELECTRICIAN;
  if (code === 'S') return USER_ROLES.SUPERVISOR;
  if (code === 'ST') return USER_ROLES.STORE;
  if (code === 'TL' || code === 'T') return USER_ROLES.TEAM_LEADER;
  if (code === 'TH') return USER_ROLES.TECHNICAL_HEAD;
  if (code === 'DH') return USER_ROLES.DEPOT_HEAD;
  if (code === 'D') return USER_ROLES.DRIVER;
  return null;
};

const normalizeExplicitRole = (roleValue) => {
  const rawRole = String(roleValue || '').trim();
  if (!rawRole) return null;

  const mappedFromCode = mapUsertypeToRole(rawRole);
  if (mappedFromCode) return mappedFromCode;

  const normalized = rawRole.toLowerCase();
  if (normalized === 'mechanic') return USER_ROLES.MECHANIC;
  if (normalized === 'electrician') return USER_ROLES.ELECTRICIAN;
  if (normalized === 'supervisor') return USER_ROLES.SUPERVISOR;
  if (normalized === 'store') return USER_ROLES.STORE;
  if (normalized === 'driver') return USER_ROLES.DRIVER;
  if (normalized === 'admin') return USER_ROLES.ADMIN;
  if (normalized === 'teamleader' || normalized === 'team leader' || normalized === 'team_leader') return USER_ROLES.TEAM_LEADER;
  if (normalized === 'technicalhead' || normalized === 'technical head' || normalized === 'technical_head') return USER_ROLES.TECHNICAL_HEAD;
  if (normalized === 'depothead' || normalized === 'depot head' || normalized === 'depot_head') return USER_ROLES.DEPOT_HEAD;

  return null;
};

export const getUserRole = (user) => {
  const roleFromUsertype = mapUsertypeToRole(user?.Usertype || user?.usertype);
  if (roleFromUsertype) return roleFromUsertype;

  const explicitRole = String(
    user?.role || user?.Role || user?.UserRole || user?.userRole || ''
  ).trim();
  const normalizedExplicitRole = normalizeExplicitRole(explicitRole);
  if (normalizedExplicitRole) return normalizedExplicitRole;

  return USER_ROLES.SUPERVISOR;
};

export const isSupervisorUser = (user) => getUserRole(user) === USER_ROLES.SUPERVISOR;
export const isStoreUser = (user) => getUserRole(user) === USER_ROLES.STORE;
export const isMechanicUser = (user) => getUserRole(user) === USER_ROLES.MECHANIC;
export const isElectricianUser = (user) => getUserRole(user) === USER_ROLES.ELECTRICIAN;
export const isTeamLeaderUser = (user) => getUserRole(user) === USER_ROLES.TEAM_LEADER;
export const isDriverUser = (user) => getUserRole(user) === USER_ROLES.DRIVER;
export const isTechnicalHeadUser = (user) => getUserRole(user) === USER_ROLES.TECHNICAL_HEAD;
export const isDepotHeadUser = (user) => getUserRole(user) === USER_ROLES.DEPOT_HEAD;
// Mechanic + Electrician are both "field staff" who execute repairs and log work entries
export const isFieldStaffUser = (user) => {
  const role = getUserRole(user);
  return role === USER_ROLES.MECHANIC || role === USER_ROLES.ELECTRICIAN;
};
// TechnicalHead and DepotHead see supervisor-level + extra management views
export const hasManagementAccess = (user) => {
  const role = getUserRole(user);
  return [
    USER_ROLES.SUPERVISOR,
    USER_ROLES.TECHNICAL_HEAD,
    USER_ROLES.DEPOT_HEAD,
    USER_ROLES.ADMIN,
  ].includes(role);
};

/**
 * Get the Maintenance Team code the current user belongs to (Team Leader / Mechanic / Electrician).
 * Populated from MCheckLogin response Data.TeamCode.
 */
export const getUserTeamCode = (user) => (
  String(user?.TeamCode || user?.teamCode || user?.Team || '').trim() || null
);

export const getUserDepot = (user) => (
  String(user?.Depot || user?.depot || '').trim() || null
);

