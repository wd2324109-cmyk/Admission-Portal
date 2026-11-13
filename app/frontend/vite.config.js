import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
// host: true  ->  `npm run dev` also listens on the PC's network / VPN addresses, so a phone can open http://<PC-or-VPN-IP>:5173
export default defineConfig({ plugins:[react()], server:{ host: true, proxy:{ '/api':'http://localhost:4000' } } });
