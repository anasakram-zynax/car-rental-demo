export {
  getModulesSummary,
  getTravelportProvider,
  setTravelportEnabled,
  setTravelportCredentials,
  testTravelportConnection,
  getHotelbedsProvider,
  setHotelbedsEnabled,
  setHotelbedsCredentials,
  testHotelbedsConnection,
} from './api/admin-settings';
export type {
  ModulesSummaryItem,
  TravelportProviderConfig,
  HotelbedsProviderConfig,
} from './api/admin-settings';
//er
export {
  useAdminModules,
  useAdminTravelportConfig,
  useAdminSetTravelportEnabled,
  useAdminSetTravelportCredentials,
  useAdminTestConnection,
} from './hooks';
