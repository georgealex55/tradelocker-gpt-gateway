"use client";
import {Component} from "react";
import styles from "./xmi.module.css";

/* A price-widget failure must not take down the XMI research workstation. */
export default class XMIChartErrorBoundary extends Component{
 constructor(props){super(props);this.state={error:false};}
 static getDerivedStateFromError(){return {error:true};}
 render(){
  if(this.state.error)return <section className={styles.chartFailure} role="alert">
   <strong>Chart display unavailable</strong>
   <p>A chart tool failed to render. Other XMI research controls remain available. No orders were sent.</p>
   <button type="button" onClick={()=>this.setState({error:false})}>Retry chart</button>
  </section>;
  return this.props.children;
 }
}
