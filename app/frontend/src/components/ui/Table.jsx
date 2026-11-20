export default function Table({ children, className = '' }) {
  return <div className="table-wrap"><table className={`data ${className}`}>{children}</table></div>;
}
