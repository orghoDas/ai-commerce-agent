import { AlertTriangle, Bot, Package, Plus, ShoppingCart, UserRoundCheck } from "lucide-react";

const metrics = [
  { label: "Open Conversations", value: "18" },
  { label: "Pending Orders", value: "12" },
  { label: "Low Stock Items", value: "7" },
  { label: "Out Of Stock", value: "4" }
];

const inventoryRows = [
  ["Wireless Headphones", "WH-1000XM5-BLK", "12", "3", "In stock"],
  ["Matte Lipstick", "LIP-RED-02", "2", "3", "Low stock"],
  ["Phone Charger 25W", "CHG-25W-USBC", "0", "5", "Out of stock"]
];

const orderRows = [
  ["ORD-000231", "Nadia Rahman", "$84.00", "Pending"],
  ["ORD-000232", "Arif Hasan", "$22.00", "Needs review"],
  ["ORD-000233", "Mina Akter", "$156.00", "Confirmed"]
];

export default function DashboardPage() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Commerce Agent</div>
        <nav className="nav" aria-label="Admin navigation">
          <a href="#">Dashboard</a>
          <a href="#">Products</a>
          <a href="#">Inventory</a>
          <a href="#">Orders</a>
          <a href="#">Conversations</a>
          <a href="#">Reports</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <main className="main">
        <section className="topbar">
          <div>
            <h1>Operations Dashboard</h1>
            <p>Monitor products, stock, orders, and conversations from one place.</p>
          </div>
          <button className="button">
            <Plus size={18} aria-hidden="true" />
            Add Product
          </button>
        </section>

        <section className="metrics" aria-label="Business metrics">
          {metrics.map((metric) => (
            <div className="metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </section>

        <section className="grid">
          <div className="panel">
            <header>
              <h2>
                <Package size={18} aria-hidden="true" /> Inventory
              </h2>
              <button className="button secondary">Import CSV</button>
            </header>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Available</th>
                  <th>Reorder</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map(([product, sku, available, reorder, status]) => (
                  <tr key={sku}>
                    <td>{product}</td>
                    <td>{sku}</td>
                    <td>{available}</td>
                    <td>{reorder}</td>
                    <td>
                      <span className={`status ${status === "Low stock" ? "warning" : ""} ${status === "Out of stock" ? "danger" : ""}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <header>
              <h2>
                <Bot size={18} aria-hidden="true" /> Agent Controls
              </h2>
            </header>
            <table className="table">
              <tbody>
                <tr>
                  <td>
                    <UserRoundCheck size={18} aria-hidden="true" /> Human takeover queue
                  </td>
                  <td>3</td>
                </tr>
                <tr>
                  <td>
                    <AlertTriangle size={18} aria-hidden="true" /> Failed tool calls
                  </td>
                  <td>1</td>
                </tr>
                <tr>
                  <td>
                    <ShoppingCart size={18} aria-hidden="true" /> Image search confirmations
                  </td>
                  <td>5</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <header>
            <h2>Recent Orders</h2>
            <button className="button secondary">View All</button>
          </header>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.map(([order, customer, total, status]) => (
                <tr key={order}>
                  <td>{order}</td>
                  <td>{customer}</td>
                  <td>{total}</td>
                  <td>
                    <span className={`status ${status === "Needs review" ? "warning" : ""}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

