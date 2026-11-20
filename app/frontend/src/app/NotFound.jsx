import { useEffect } from 'react';

export default function NotFound() {
  useEffect(() => { document.title = 'Page not found · School Admissions Portal'; }, []);
  return <main className="notfound"><div>
    <div className="notfound__code">404</div><h1>Page not found</h1><p>The page you are looking for does not exist.</p>
    <a className="btn btn--primary" href={import.meta.env.BASE_URL}>Go to the portal</a>
  </div></main>;
}
