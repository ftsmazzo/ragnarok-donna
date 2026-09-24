export {
  getOrderDetail,
  getOrderPermissions,
  listCatalogForOrders,
  listOpenOrders,
  listOrderHistory,
} from "./queries";
export {
  addOrderItem,
  addPayment,
  cancelOrder,
  closeOrder,
  openOrder,
  openStaffConsumptionOrder,
  reopenOrder,
  removeOrderItem,
  setOrderClient,
  setOrderDiscount,
} from "./mutations";
export type {
  CatalogProduct,
  CatalogService,
  CatalogStaff,
  OrderDetail,
  OrderListItem,
  OrderPermissions,
} from "./types";
