// Scrolls sideways inside its own box on narrow screens instead of breaking the page layout.
export default function Table({ children, className = '' }) {
  return <div className="table-wrap"><table className={`data ${className}`}>{children}</table></div>;
}
