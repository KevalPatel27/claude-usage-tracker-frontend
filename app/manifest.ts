import type { MetadataRoute } from 'next';

export default function manifest():MetadataRoute.Manifest {
 return {
  name:'Usage ledger — Claude Code usage tracker',short_name:'Usage ledger',
  description:'Track collected Claude Code usage across your configured PCs.',
  start_url:'/overview',scope:'/',display:'standalone',background_color:'#f7f9fa',theme_color:'#163447',
  icons:[{src:'/brand/app-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
   {src:'/brand/app-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
   {src:'/brand/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],
 };
}
