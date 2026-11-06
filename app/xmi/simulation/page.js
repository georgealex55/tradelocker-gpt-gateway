import "../xmi-root.css";
import {redirect} from 'next/navigation';
import XMISimulationDesk from './XMISimulationDesk';
const STAGING_RESEARCH='https://tradelocker-gpt-gatewa-git-f7a7dd-georgealex1925-2750s-projects.vercel.app/xmi/simulation';
export const metadata={title:'XMI 2.0 | Forex Strategy Research & Simulation',description:'Isolated Forex research, versioned signals, conservative historical execution and private simulated ledgers.'};
export default function SimulationPage(){
 if(process.env.VERCEL_ENV==='production')redirect(STAGING_RESEARCH);
 return <XMISimulationDesk/>;
}
