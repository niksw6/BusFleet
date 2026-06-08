import { USER_ROLES } from '../constants/config';

export const mapUsertypeToRole = (usertype) => {
  const code = String(usertype || '').trim().toUpperCase();
  if (code === 'M') return USER_ROLES.MECHANIC;
  if (code === 'S') return USER_ROLES.SUPERVISOR;
  return null;
};

const normalizeExplicitRole = (roleValue) => {
  const rawRole = String(roleValue || '').trim();
  if (!rawRole) return null;

  const mappedFromCode = mapUsertypeToRole(rawRole);
  if (mappedFromCode) return mappedFromCode;

  const normalized = rawRole.toLowerCase();
  if (normalized === 'mechanic') return USER_ROLES.MECHANIC;
  if (normalized === 'supervisor') return USER_ROLES.SUPERVISOR;
  if (normalized === 'driver') return USER_ROLES.DRIVER;
  if (normalized === 'admin') return USER_ROLES.ADMIN;

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
export const isMechanicUser = (user) => getUserRole(user) === USER_ROLES.MECHANIC;
