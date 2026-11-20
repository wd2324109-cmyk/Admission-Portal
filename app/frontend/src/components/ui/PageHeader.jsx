export default function PageHeader({ title, children, note }) {
  return <div className="page-head">
    <div><h1>{title}</h1>{note && <p className="page-head__note">{note}</p>}</div>
    {children && <div className="page-head__actions">{children}</div>}
  </div>;
}
