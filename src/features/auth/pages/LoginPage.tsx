import React, { useEffect, useRef, useState } from "react";
import { useOktaAuth } from "@okta/okta-react";
import tcwLogo from "../../../assets/tcw-logo.png";
import "../../../styles/LoginPage.css";

export default function LoginPage() {
  const { oktaAuth, authState } = useOktaAuth();
  const [startingLogin, setStartingLogin] = useState(false);

  // left panel ref
  const leftRef = useRef<HTMLDivElement | null>(null);

  // intro animation flag (disable mouse until intro completes)
  const [introDone, setIntroDone] = useState(false);

  const handleLogin = async () => {
    setStartingLogin(true);
    oktaAuth.setOriginalUri("/");
    await oktaAuth.signInWithRedirect();
  };

  const isDisabled =
    !authState || Boolean((authState as any)?.isPending) || startingLogin;

  // ✅ Intro animation: moves around ~2 times, then reset
  useEffect(() => {
    const el = leftRef.current;
    if (!el) return;

    let raf = 0;
    const durationMs = 1800; // total intro duration
    const loops = 1;         // "move around two time"

    const start = performance.now();

    const tick = (now: number) => {
      const t = (now - start) / durationMs; // 0..1
      if (t >= 1) {
        // reset
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
        el.style.setProperty("--bg-x", "50%");
        el.style.setProperty("--bg-y", "50%");
        setIntroDone(true);
        return;
      }

      // Smooth looping phase 0..(2π*loops)
      const phase = t * Math.PI * 2 * loops;

      // Tilt values (keep subtle and professional)
      const rotateX = Math.sin(phase) * 4;          // -4..4 deg
      const rotateY = Math.cos(phase * 0.9) * 4;    // -4..4 deg

      // Background parallax movement
      const bgX = 50 + Math.cos(phase) * 4;         // 46%..54%
      const bgY = 50 + Math.sin(phase * 0.85) * 4;  // 46%..54%

      el.style.setProperty("--rx", `${rotateX}deg`);
      el.style.setProperty("--ry", `${rotateY}deg`);
      el.style.setProperty("--bg-x", `${bgX}%`);
      el.style.setProperty("--bg-y", `${bgY}%`);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ✅ User mouse move (only after intro is done)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!introDone) return; // disable during intro

    const el = leftRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // 3D tilt
    const rotateY = ((x - cx) / cx) * 6;
    const rotateX = -((y - cy) / cy) * 6;

    el.style.setProperty("--rx", `${rotateX}deg`);
    el.style.setProperty("--ry", `${rotateY}deg`);

    // background parallax
    const bgX = 50 + ((x - cx) / cx) * 6;
    const bgY = 50 + ((y - cy) / cy) * 6;

    el.style.setProperty("--bg-x", `${bgX}%`);
    el.style.setProperty("--bg-y", `${bgY}%`);
  };

  const handleMouseLeave = () => {
    if (!introDone) return;

    const el = leftRef.current;
    if (!el) return;

    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--bg-x", "50%");
    el.style.setProperty("--bg-y", "50%");
  };

  return (
    <div className="tcw-login-layout">
      {/* LEFT 65% */}
      <div
        className="tcw-login-left"
        ref={leftRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="tcw-left-inner">
          <img src={tcwLogo} alt="TCW" className="tcw-brand-logo" />
          <h1 className="tcw-brand-title">DQM</h1>
          <p className="tcw-brand-desc">
            Data Quality Management for reconciliation, issue workflow, and audit-ready reporting.
            Secure access via Okta.
          </p>

          <div className="tcw-brand-pills">
            <span className="tcw-pill">Reconciliation</span>
            <span className="tcw-pill">DQ Checks</span>
            <span className="tcw-pill">Issue Workflow</span>
          </div>
        </div>
      </div>

      {/* RIGHT 35% */}
      <div className="tcw-login-right">
        <div className="tcw-login-card">
          <div className="tcw-card-top">
            {/* <div className="tcw-card-badge">TCW</div> */}
            <div>
              <h2 className="tcw-login-title">Login</h2>
              <p className="tcw-login-subtitle">Use your TCW account to access DQM.</p>
            </div>
          </div>

          <button className="tcw-login-button" onClick={handleLogin} disabled={isDisabled}>
            {startingLogin ? "Redirecting to Okta…" : "Login with Okta"}
          </button>

          <div className="tcw-login-helper">Need access? Contact your DQM admin team.</div>

          <div className="tcw-login-footer">
            © {new Date().getFullYear()} TCW • Authorized use only
          </div>
        </div>
      </div>
    </div>
  );
}