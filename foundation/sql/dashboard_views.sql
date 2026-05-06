<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rock Solid - Canada SR</title>
<link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@300;400;500;600&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  /* ===================== TOKENS ===================== */
  :root {
    /* BLW Canada Inspired Purple/Cream Palette */
    --navy: #4C2A92;
    --navy2: #321B66;

    --gold: #F4BE41;
    --gold-soft: #FCE7AE;

    --red: #8E63C7;
    --red-soft: #E9DAFB;

    --pink: #CDB5EA;
    --pink-soft: #F3ECFB;

    --cream: #F4EFE3;
    --cream-2: #FBF7EF;

    --ink: #2F2250;
    --muted: #6F6482;

    --border: #E6DDCC;
    --white: #FFFFFF;

    --shadow-sm: 0 2px 8px rgba(50, 27, 102, 0.06);
    --shadow-md: 0 10px 30px rgba(50, 27, 102, 0.10);
    --shadow-lg: 0 18px 50px rgba(50, 27, 102, 0.14);

    --radius: 18px;

    /* Role Colours */
    --c-student: #0F766E;
    --c-cell: #B52A2A;
    --c-ft: #F4BE41;
    --c-admin: #4C2A92;
    --c-teacher: #6D28D9;
    --c-principal: #321B66;
    --c-group: #8E63C7;
    --c-system: #4B5563;

    --c-ok: #059669;
    --c-warn: #F59E0B;
    --c-danger: #DC2626;

    /* Backward-compatible aliases used by this page */
    --orange: var(--red);
    --orange2: #3A2075;
    --cream2: #F8F1E4;
    --pink-bg: var(--pink-soft);
    --text: var(--navy);
    --card-bg: rgba(76, 42, 146, 0.05);
    --card-hover: rgba(142, 99, 199, 0.10);
    --card-active: rgba(142, 99, 199, 0.14);
    --font-head: 'League Spartan', sans-serif;
    --font-body: 'Nunito', sans-serif;
    --ease: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* ===================== RESET ===================== */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; scroll-behavior: smooth; }
  body {
    font-family: 'Nunito', sans-serif;
    background: var(--cream);
    color: var(--text);
    overflow: hidden;
    height: 100dvh;
    width: 100vw;
  }

  /* Dashboard style overrides */
  header{
    background:var(--white);
    color:var(--ink);
    border-bottom:1px solid var(--border);
  }
  .hdr-title{
    color:var(--navy);
    font-weight:900;
    letter-spacing:-0.04em;
  }
  .hdr-sub{ color:var(--muted); }
  .toolbar{
    background:rgba(255,255,255,0.85);
    backdrop-filter:blur(10px);
    border-bottom:1px solid var(--border);
    box-shadow:var(--shadow-sm);
  }
  input,
  select,
  textarea{
    border:1px solid var(--border);
    border-radius:12px;
    background:white;
  }
  input:focus,
  select:focus,
  textarea:focus{
    outline:none;
    border-color:var(--navy);
    box-shadow:0 0 0 4px rgba(76,42,146,0.14);
  }

  /* ===================== PROGRESS BAR ===================== */
  .progress-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    height: 4px;
    background: rgba(76,42,146,0.10);
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4C2A92, #F4BE41);
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    width: 0%;
    box-shadow: 0 0 12px rgba(142,99,199,0.45);
    border-radius: 0 2px 2px 0;
  }

  /* ===================== NAV ===================== */
  .nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 150;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 32px;
    pointer-events: none;
  }
  .nav-logo {
    display: flex; align-items: center; gap: 10px;
    opacity: 0; transition: opacity 0.4s;
  }
  .nav-logo.visible { opacity: 1; pointer-events: auto; }
  .nav-logo-svg { width: 28px; height: 28px; }
  .nav-logo-text {
    font-family: var(--font-head);
    font-size: 14px; font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--navy);
  }
  .nav-step {
    font-family: var(--font-body);
    font-size: 11px; font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.06em;
    pointer-events: none;
    background: var(--cream2);
    border: 1px solid var(--border);
    border-radius: 50px;
    padding: 5px 13px;
    opacity: 0;
    transition: opacity 0.3s;
  }
  .nav-step.visible { opacity: 1; }

  /* ===================== INTRO  SPLIT SCREEN ===================== */
  #screen-intro {
    position: fixed; inset: 0; z-index: 10;
    display: flex;
    opacity: 1; transform: none;
    pointer-events: auto;
    transition: opacity 0.55s var(--ease), transform 0.55s var(--ease);
  }
  #screen-intro.exit-up {
    opacity: 0; transform: translateY(-40px);
    pointer-events: none;
  }

  /* LEFT  brand image panel */
  .intro-left {
    flex: 0 0 50%;
    background: var(--navy);
    position: relative;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  /* Decorative blobs */
  .intro-left::before {
    content: '';
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(244,190,65,0.28) 0%, transparent 55%),
      radial-gradient(ellipse at 75% 75%, rgba(142,99,199,0.28) 0%, transparent 50%),
      radial-gradient(ellipse at 10% 85%, rgba(50,27,102,0.35) 0%, transparent 40%);
  }
  .intro-left-content {
    position: relative; z-index: 2;
    display: flex; flex-direction: column; align-items: center;
    gap: 0;
    padding: 40px;
    text-align: center;
  }
  /* Big planet illustration */
  .planet-illo {
    width: 260px; height: 260px;
    margin-bottom: 32px;
    object-fit: contain;
    animation: float 5s ease-in-out infinite;
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(-2deg); }
    50% { transform: translateY(-14px) rotate(2deg); }
  }
  .intro-left-brand {
    display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  }
  .intro-left-tagline {
    font-family: var(--font-body);
    font-size: 13px; font-weight: 400;
    color: rgba(247,243,235,0.55);
    letter-spacing: 0.04em;
  }
  /* Floating dots decoration */
  .dot-field {
    position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  }
  .dot {
    position: absolute; border-radius: 50%;
    background: rgba(247,243,235,0.08);
    animation: drift linear infinite;
  }
  @keyframes drift {
    0% { transform: translateY(0) scale(1); opacity: 0.6; }
    50% { opacity: 1; }
    100% { transform: translateY(-60px) scale(0.8); opacity: 0; }
  }

  /* RIGHT  form content */
  .intro-right {
    flex: 0 0 50%;
    background: var(--cream);
    display: flex; align-items: center; justify-content: center;
    padding: 60px 56px;
    overflow-y: auto;
  }
  .intro-right-content { max-width: 380px; width: 100%; }
  .intro-eyebrow {
    font-family: var(--font-body);
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--orange); margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .intro-eyebrow::before {
    content: '';
    width: 20px; height: 2px;
    background: var(--orange); border-radius: 1px;
  }
  .intro-title {
    font-family: var(--font-head);
    font-size: clamp(38px, 5vw, 58px);
    font-weight: 900; line-height: 0.95;
    letter-spacing: -0.02em;
    color: var(--navy);
    margin-bottom: 20px;
  }
  .intro-title em {
    font-style: normal;
    color: var(--gold);
  }
  .intro-sub {
    font-family: var(--font-body);
    font-size: 15px; font-weight: 400; line-height: 1.7;
    color: var(--muted); margin-bottom: 36px;
  }
  .btn-start {
    display: inline-flex; align-items: center; gap: 12px;
    background: var(--navy);
    color: var(--white); font-family: var(--font-head);
    font-size: 15px; font-weight: 800;
    letter-spacing: 0.04em; text-transform: uppercase;
    padding: 17px 36px; border: none; border-radius: 50px;
    cursor: pointer; width: 100%;
    justify-content: center;
    transition: transform 0.2s var(--ease-bounce), box-shadow 0.2s, background 0.2s;
    box-shadow: 0 6px 28px rgba(76,42,146,0.30);
  }
  .btn-start:hover {
    background: var(--orange2);
    transform: translateY(-2px);
    box-shadow: 0 10px 36px rgba(244,190,65,0.32);
  }
  .btn-start:active { transform: scale(0.98); }
  .btn-start .arrow { font-size: 18px; transition: transform 0.2s; }
  .btn-start:hover .arrow { transform: translateX(4px); }

  .intro-pills {
    margin-top: 24px; display: flex; flex-wrap: wrap; gap: 8px;
  }
  .intro-pill {
    font-family: var(--font-body);
    font-size: 12px; font-weight: 500;
    color: var(--muted);
    background: var(--cream2);
    border: 1px solid var(--border);
    border-radius: 50px;
    padding: 6px 14px;
    display: flex; align-items: center; gap: 5px;
  }

  /* ===================== FORM SCREENS ===================== */
  .screen {
    position: fixed; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    padding: 80px 32px 40px;
    background: var(--cream);
    opacity: 0;
    transform: translateY(48px);
    pointer-events: none;
    transition: opacity 0.45s var(--ease), transform 0.45s var(--ease);
  }
  .screen.active {
    opacity: 1; transform: translateY(0);
    pointer-events: auto;
  }
  .screen.exit-up {
    opacity: 0; transform: translateY(-48px);
    pointer-events: none;
  }
  .screen.exit-down {
    opacity: 0; transform: translateY(48px);
    pointer-events: none;
  }

  /* ===================== QUESTION WRAP ===================== */
  .q-wrap { max-width: 620px; width: 100%; }
  .q-num {
    font-family: var(--font-body);
    font-size: 11px; font-weight: 600;
    color: var(--orange); letter-spacing: 0.14em;
    text-transform: uppercase; margin-bottom: 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .q-num::after { content: '->'; font-size: 13px; }
  .q-label {
    font-family: var(--font-head);
    font-size: clamp(28px, 4.5vw, 44px);
    font-weight: 800; line-height: 1.1;
    color: var(--navy); margin-bottom: 8px;
    letter-spacing: -0.01em;
  }
  .q-hint {
    font-family: var(--font-body);
    font-size: 14px; color: var(--muted);
    margin-bottom: 28px; line-height: 1.6;
  }

  /* ===================== TEXT INPUT ===================== */
  .field-wrap { position: relative; }
  .name-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-bottom: 4px;
  }
  .name-field .field-input { font-size: clamp(20px, 3vw, 30px); }
  .field-input {
    width: 100%;
    background: transparent;
    border: none; border-bottom: 2px solid var(--border);
    color: var(--navy);
    font-family: var(--font-head);
    font-size: clamp(22px, 3.5vw, 32px);
    font-weight: 600; padding: 12px 0 14px;
    outline: none; caret-color: var(--orange);
    transition: border-color 0.3s;
  }
  .field-input::placeholder { color: rgba(76,42,146,0.26); }
  .field-input:focus { border-bottom-color: rgba(142,99,199,0.55); }
  .field-underline {
    position: absolute; bottom: 0; left: 0;
    height: 2px; background: var(--orange);
    width: 0; transition: width 0.4s var(--ease);
    border-radius: 1px;
  }
  .field-input:focus ~ .field-underline { width: 100%; }

  /* ===================== SELECT ===================== */
  .field-select {
    width: 100%;
    background: var(--white);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    color: var(--navy);
    font-family: var(--font-body);
    font-size: 16px; font-weight: 500;
    padding: 16px 20px; outline: none;
    cursor: pointer; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234C2A92' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    transition: border-color 0.3s, box-shadow 0.2s;
  }
  .field-select:focus {
    border-color: var(--navy);
    box-shadow: 0 0 0 3px rgba(76,42,146,0.14);
  }
  .field-select option { background: var(--white); color: var(--navy); }

  /* ===================== RADIO CARDS ===================== */
  .radio-grid {
    display: grid; gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .radio-card { position: relative; cursor: pointer; }
  .radio-card input { position: absolute; opacity: 0; width: 0; height: 0; }
  .radio-label {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px;
    background: var(--white);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: 15px; font-weight: 500; color: var(--navy);
    transition: all 0.2s var(--ease);
    user-select: none;
  }
  .radio-label:hover {
    border-color: rgba(142,99,199,0.55);
    background: var(--card-hover);
  }
  .radio-card input:checked ~ .radio-label {
    border-color: var(--gold);
    background: var(--card-active);
    color: var(--navy);
    box-shadow: 0 0 0 3px rgba(244,190,65,0.28);
  }
  .radio-key {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; min-width: 22px;
    border: 1.5px solid var(--border); border-radius: 6px;
    font-family: var(--font-body); font-size: 11px; font-weight: 700;
    color: var(--muted); transition: all 0.2s;
    background: var(--cream2);
  }
  .radio-card input:checked ~ .radio-label .radio-key {
    border-color: var(--gold); color: var(--navy);
    background: rgba(244,190,65,0.20);
  }

  /* ===================== FAITH QUESTIONS ===================== */
  .faith-group { display: grid; gap: 4px; }
  .faith-q-label {
    font-family: var(--font-body);
    font-size: 11px; font-weight: 600;
    color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.1em;
    margin-bottom: 6px; margin-top: 16px;
  }

  /* Step 5 only — compact 3-column radio layout */
  #screen-5 .q-label { font-size: 22px; }
  #screen-5 .q-hint  { font-size: 13px; margin-bottom: 8px; }
  #screen-5 .radio-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  #screen-5 .radio-label {
    padding: 10px 8px;
    font-size: 13px;
    justify-content: center;
    text-align: center;
    min-height: 44px;
    gap: 6px;
  }
  #screen-5 .radio-key { display: none; }

  /* ===================== CLASS CARDS ===================== */
  .class-grid { display: grid; gap: 8px; }
  .class-card { position: relative; cursor: pointer; }
  .class-card input { position: absolute; opacity: 0; width: 0; height: 0; }
  .class-card-label {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    background: var(--white);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    transition: all 0.2s var(--ease);
    cursor: pointer;
  }
  .class-card-label:hover {
    border-color: rgba(142,99,199,0.55);
    background: var(--card-hover);
  }
  .class-card input:checked ~ .class-card-label {
    border-color: var(--gold);
    background: var(--card-active);
    box-shadow: 0 0 0 3px rgba(244,190,65,0.28);
  }
  .class-name {
    font-family: var(--font-head);
    font-size: 15px; font-weight: 700; color: var(--navy);
    margin-bottom: 2px;
  }
  .class-time {
    font-family: var(--font-body);
    font-size: 12px; color: var(--muted);
  }
  .class-badge {
    font-family: var(--font-body);
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 4px 10px; border-radius: 50px;
    background: rgba(142,99,199,0.16);
    color: var(--navy); border: 1px solid rgba(244,190,65,0.36);
  }
  .class-card input:checked ~ .class-card-label .class-badge {
    background: var(--gold); color: var(--navy);
    border-color: var(--gold);
  }

  /* ===================== ACTIONS ===================== */
  .q-actions {
    display: flex; align-items: center; gap: 12px;
    margin-top: 28px;
  }
  .btn-next {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--navy);
    color: var(--white); font-family: var(--font-head);
    font-size: 13px; font-weight: 800;
    letter-spacing: 0.06em; text-transform: uppercase;
    padding: 14px 28px; border: none; border-radius: 50px;
    cursor: pointer; position: relative; overflow: hidden;
    transition: transform 0.2s var(--ease-bounce), box-shadow 0.2s, background 0.2s;
    box-shadow: 0 4px 18px rgba(50,27,102,0.25);
  }
  .btn-next::after {
    content: '';
    position: absolute; inset: 0;
    background: rgba(255,255,255,0);
    transition: background 0.2s;
    border-radius: inherit;
  }
  .btn-next:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(244,190,65,0.30);
    background: #3A2075;
  }
  .btn-next:active {
    transform: scale(0.97);
    box-shadow: 0 2px 10px rgba(50,27,102,0.24);
  }
  .btn-next:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
  .btn-back {
    background: none; border: 1.5px solid var(--border);
    color: var(--muted); font-family: var(--font-body);
    font-size: 13px; font-weight: 500; cursor: pointer;
    padding: 9px 16px; display: flex; align-items: center; gap: 5px;
    border-radius: 50px;
    transition: color 0.2s, background 0.2s, border-color 0.2s, transform 0.15s;
  }
  .btn-back:hover { color: var(--navy); background: var(--cream2); border-color: rgba(76,42,146,0.30); transform: translateX(-2px); }
  .btn-back:active { transform: scale(0.97); }
  .enter-hint {
    font-family: var(--font-body);
    font-size: 11px; color: var(--muted);
    display: flex; align-items: center; gap: 4px; margin-left: auto;
  }
  .enter-hint kbd {
    background: var(--cream2);
    border: 1px solid var(--border);
    border-radius: 4px; padding: 2px 6px;
    font-family: var(--font-body); font-size: 10px;
    color: var(--text);
  }

  /* ===================== LOADING ===================== */
.loading-wrap {
    display: flex; align-items: center; gap: 12px;
    color: var(--muted); font-size: 13px; font-family: var(--font-body);
    padding: 20px 0;
  }
  .spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(76,42,146,0.22);
    border-top-color: var(--orange);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .class-skeleton {
    height: 62px;
    border-radius: var(--radius);
    border: 1.5px solid var(--border);
    background: linear-gradient(90deg, rgba(76,42,146,0.06) 25%, rgba(142,99,199,0.14) 40%, rgba(76,42,146,0.06) 60%);
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.2s infinite linear;
  }
  @keyframes skeleton-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* ===================== ERROR ===================== */
  .field-error {
    font-family: var(--font-body);
    font-size: 12px; color: #C0392B;
    margin-top: 8px;
    display: flex; align-items: center; gap: 5px;
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transform: translateY(-4px);
    transition: max-height 0.3s var(--ease), opacity 0.3s var(--ease), transform 0.3s var(--ease);
    pointer-events: none;
  }
  .field-error::before { content: '⚠'; font-size: 11px; }
  .field-error { display: flex; }
  .field-error.show {
    max-height: 40px;
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  /* ===================== SUCCESS ===================== */
  .success-content {
    text-align: center; max-width: 560px; width: 100%;
  }
  .success-icon {
    width: 88px; height: 88px; margin: 0 auto 24px;
    background: linear-gradient(135deg, #F4BE41, #8E63C7);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 40px;
    box-shadow: 0 0 0 16px rgba(244,190,65,0.22), 0 0 60px rgba(142,99,199,0.30);
    animation: success-pop 0.65s var(--ease-bounce);
  }
  @keyframes success-pop {
    0% { transform: scale(0) rotate(-15deg); opacity: 0; }
    60% { transform: scale(1.08) rotate(3deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  .success-title {
    font-family: var(--font-head);
    font-size: clamp(32px, 5vw, 52px);
    font-weight: 900; color: var(--navy);
    letter-spacing: -0.02em; margin-bottom: 10px;
    line-height: 1;
    animation: fade-up 0.5s 0.15s both var(--ease);
  }
  .success-sub {
    font-family: var(--font-body);
    font-size: 15px; color: var(--muted);
    line-height: 1.7; margin-bottom: 28px;
    animation: fade-up 0.5s 0.25s both var(--ease);
  }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .summary-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 16px; padding: 4px 0;
    margin-bottom: 20px; text-align: left;
    box-shadow: 0 2px 16px rgba(50,27,102,0.10);
    animation: fade-up 0.5s 0.35s both var(--ease);
    overflow: hidden;
  }
  .summary-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 13px 24px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
    transition: background 0.15s;
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-row:hover { background: var(--cream); }
  .summary-key { font-family: var(--font-body); color: var(--muted); font-weight: 400; font-size: 12px; letter-spacing: 0.04em; }
  .summary-val { font-family: var(--font-head); color: var(--navy); font-weight: 700; font-size: 14px; max-width: 60%; text-align: right; }
  .chips-wrap {
    display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
    animation: fade-up 0.5s 0.45s both var(--ease);
  }
  .chip {
    font-family: var(--font-body); font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
    padding: 7px 16px; border-radius: 50px;
    display: flex; align-items: center; gap: 5px;
  }
  .chip::before { font-size: 12px; }
  .chip.success { background: rgba(142,99,199,0.14); color: #4C2A92; border: 1px solid rgba(244,190,65,0.38); }
  .chip.success::before { content: '✓'; }
  .chip.error-chip { background: rgba(142,99,199,0.10); color: #6A3DAE; border: 1px solid rgba(142,99,199,0.30); }
  .chip.error-chip::before { content: '✕'; }
  .chip.pending { background: rgba(244,190,65,0.24); color: #4C2A92; border: 1px solid rgba(244,190,65,0.40); }
  .chip.pending::before { content: '◉'; }

  /* ===================== CONFETTI ===================== */
  .confetti-container {
    position: fixed; inset: 0; z-index: 999;
    pointer-events: none; overflow: hidden;
  }
  .confetti-piece {
    position: absolute; top: -10px;
    animation: confetti-fall linear forwards;
  }
  @keyframes confetti-fall {
    0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }

  /* ===================== MOBILE ===================== */
  @media (max-width: 700px) {
    .name-grid { grid-template-columns: 1fr; gap: 14px; }
    #screen-intro {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      overflow: hidden;
    }
    .intro-left {
      flex: 0 0 40vh;
      min-height: 200px;
      max-height: 260px;
      padding: 10px 14px 8px;
      background:
        linear-gradient(175deg, var(--navy2) 72%, #E9DEF7 100%);
    }
    .intro-left-content {
      padding: 4px;
      justify-content: center;
      min-height: 100%;
    }
    .planet-illo {
      width: 140px !important;
      height: 140px !important;
      margin-bottom: 0 !important;
      animation: none !important;
    }
    .intro-left-brand { margin-bottom: 0; }
    .intro-left-tagline { font-size: 11px; }
    .intro-right {
      flex: 1;
      justify-content: flex-start;
      padding: 28px 24px 36px;
      margin-top: -14px;
      border-radius: 20px 20px 0 0;
      overflow: hidden;
    }
    .intro-right-content { max-width: 100%; }
    .intro-eyebrow { margin-bottom: 10px; }
    .intro-title { font-size: 38px; margin-bottom: 28px; }
    .intro-sub { font-size: 13px; line-height: 1.5; margin-bottom: 0; }
    .btn-start { margin-top: 0; margin-bottom: 24px; padding: 14px 24px; }
    .intro-pills {
      margin-top: 0;
      gap: 6px;
    }
    .intro-pill {
      color: var(--navy);
      background: rgba(142,99,199,0.14);
      border: 1.5px solid rgba(142,99,199,0.34);
      font-weight: 600;
      padding: 5px 12px;
    }
    .nav { padding: 12px 18px; }
    .screen { padding: 68px 20px 28px; }
    .radio-grid { grid-template-columns: 1fr; }
    .q-actions { flex-wrap: wrap; }
    .enter-hint { display: none; }
    .lp-logo-name { font-size: 18px; }
    .q-label { font-size: clamp(24px, 7vw, 36px); }
    .field-input { font-size: clamp(20px, 6vw, 28px); }
  }
  @media (max-width: 420px) {
    .intro-title { font-size: 32px; }
    .btn-start { font-size: 14px; padding: 15px 28px; }
    .intro-left {
      min-height: 132px;
      padding: 8px 12px 6px;
    }
    .planet-illo {
      width: 84px;
      height: 84px;
      margin-bottom: -10px;
      animation: none;
    }
    .intro-right {
      padding: 6px 18px 14px;
      margin-top: -16px;
    }
  }

  /* ===================== FOCUS RING ===================== */
  .field-input:focus-visible { outline: none; }
  .btn-next:focus-visible, .btn-back:focus-visible, .btn-start:focus-visible {
    outline: 2px solid var(--navy); outline-offset: 3px;
  }
  .radio-card input:focus-visible ~ .radio-label {
    outline: 2px solid var(--navy); outline-offset: 2px;
  }

  /* ===================== RADIO CARD TRANSITIONS ===================== */
  .radio-label { transition: all 0.18s var(--ease); }
  .radio-card input:checked ~ .radio-label {
    transform: translateY(-1px);
  }

  /* ===================== CLASS GRID SCROLLBAR ===================== */
  #classGrid::-webkit-scrollbar { width: 4px; }
  #classGrid::-webkit-scrollbar-track { background: transparent; }
  #classGrid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* ===================== FELLOWSHIP INPUT ===================== */
  #fellowship {
    transition: border-color 0.3s, box-shadow 0.2s, transform 0.15s;
  }
  #fellowship:focus {
    transform: translateY(-1px);
  }

  /* ===================== Q-WRAP STAGGER ===================== */
  .screen.active .q-num { animation: fade-up 0.4s 0.05s both var(--ease); }
  .screen.active .q-label { animation: fade-up 0.4s 0.12s both var(--ease); }
  .screen.active .q-hint { animation: fade-up 0.4s 0.18s both var(--ease); }
  .screen.active .field-wrap,
  .screen.active .radio-grid,
  .screen.active .faith-group,
  .screen.active .class-grid,
  .screen.active #fellowship-loading,
  .screen.active #fellowship { animation: fade-up 0.4s 0.22s both var(--ease); }
  .screen.active .q-actions { animation: fade-up 0.4s 0.3s both var(--ease); }

</style>
  <link rel="stylesheet" href="../ui/premium-theme.css" />
</head>
<body>
<div id="welcome-back-banner" class="q-hint" style="display:none;position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:220;background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:999px;">
  Welcome back!
</div>

<div class="confetti-container" id="confetti"></div>
<div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>

<!-- NAV -->
<div class="nav">
  <div class="nav-logo" id="navLogo">
    <span class="nav-logo-text">Rock Solid</span>
  </div>
  <div class="nav-step" id="navStep"></div>
</div>

<!-- ===== INTRO (split screen) ===== -->
<div id="screen-intro">

  <!-- LEFT  illustration panel -->
  <div class="intro-left">
    <!-- Floating dots -->
    <div class="dot-field" id="dotField"></div>

    <div class="intro-left-content">
      <img class="planet-illo" src="./canada_sr.png" alt="Canada SR logo">

    <!--  <div class="intro-left-tagline">BLW Canada Sub-Region</div>-->
    </div>
  </div>

  <!-- RIGHT  CTA content -->
  <div class="intro-right">
    <div class="intro-right-content">
      <div class="intro-eyebrow">Rock Solid</div>
      <h1 class="intro-title">Start Your<br><em>Journey.</em></h1>
    <!--  <p class="intro-sub">An 8-class discipleship programme to deepen your faith and ground you in the Word. Registration takes less than 2 minutes.</p>
    -->
      <button class="btn-start" onclick="startForm()">
        Register Now <span class="arrow">-></span>
      </button>

     
    </div>
  </div>
</div>

<!-- ===== STEP 1: Name ===== -->
<div class="screen" id="screen-1">
  <div class="q-wrap">
    <div class="q-num">01</div>
    <div class="q-label">What's your name?</div>
    <div class="q-hint">Let's start with what we call you.</div>
    <div class="name-grid">
      <div class="field-wrap name-field">
        <input class="field-input" type="text" id="firstName" placeholder="First name" autocomplete="given-name" autocapitalize="words">
        <div class="field-underline"></div>
      </div>
      <div class="field-wrap name-field">
        <input class="field-input" type="text" id="lastName" placeholder="Last name" autocomplete="family-name" autocapitalize="words">
        <div class="field-underline"></div>
      </div>
    </div>
    <div class="field-error" id="err-firstName">Please enter your first name.</div>
    <div class="field-error" id="err-lastName">Please enter your last name.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()"> Back</button>
      <button class="btn-next" onclick="nextStep(1)">OK </button>
      <span class="enter-hint">Press <kbd>Enter </kbd></span>
    </div>
  </div>
</div>

<!-- ===== STEP 2: Email ===== -->
<div class="screen" id="screen-2">
  <div class="q-wrap">
    <div class="q-num">02</div>
    <div class="q-label">Your email address?</div>
    <div class="q-hint">We'll send your confirmation and class details here.</div>
    <div class="field-wrap">
      <input class="field-input" type="email" id="email" placeholder="you@example.com" autocomplete="email">
      <div class="field-underline"></div>
    </div>
    <div class="field-wrap" style="margin-top:12px;">
      <input class="field-input" type="email" id="emailConfirm" placeholder="Confirm your email" autocomplete="email">
      <div class="field-underline"></div>
    </div>
    <div class="field-error" id="err-email">Please enter a valid email address.</div>
    <div class="field-error" id="err-emailConfirm">Email addresses do not match.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()"> Back</button>
      <button class="btn-next" onclick="nextStep(2)">OK </button>
      <span class="enter-hint">Press <kbd>Enter </kbd></span>
    </div>
  </div>
</div>

<!-- ===== STEP 3: Phone ===== -->
<div class="screen" id="screen-3">
  <div class="q-wrap">
    <div class="q-num">03</div>
    <div class="q-label">Your phone number?</div>
    <div class="q-hint">Canadian format, e.g. 416-555-0123</div>
    <div class="field-wrap">
      <input class="field-input" type="tel" id="phone" placeholder="416-555-0123" autocomplete="tel">
      <div class="field-underline"></div>
    </div>
    <div class="field-error" id="err-phone">Please enter a valid phone number.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()">Back</button>
      <button class="btn-next" onclick="nextStep(3)">OK</button>
      <span class="enter-hint">Press <kbd>Enter</kbd></span>
    </div>
  </div>
</div>

<!-- ===== STEP 4: Faith Questions ===== -->
<div class="screen" id="screen-4">
  <div class="q-wrap">
    <div class="q-num">04</div>
    <div class="q-label">A few faith questions</div>
    <div class="faith-group">
      <div>
        <div class="faith-q-label">Are you born again?</div>
        <div class="radio-grid">
          <label class="radio-card"><input type="radio" name="bornAgain" value="Yes"><span class="radio-label"><span class="radio-key">A</span> Yes</span></label>
          <label class="radio-card"><input type="radio" name="bornAgain" value="No"><span class="radio-label"><span class="radio-key">B</span> No</span></label>
          <label class="radio-card"><input type="radio" name="bornAgain" value="I'm not sure"><span class="radio-label"><span class="radio-key">C</span> Not sure</span></label>
        </div>
      </div>
      <div>
        <div class="faith-q-label">Do you speak in tongues?</div>
        <div class="radio-grid">
          <label class="radio-card"><input type="radio" name="tongues" value="Yes"><span class="radio-label"><span class="radio-key">A</span> Yes</span></label>
          <label class="radio-card"><input type="radio" name="tongues" value="No"><span class="radio-label"><span class="radio-key">B</span> No</span></label>
          <label class="radio-card"><input type="radio" name="tongues" value="I'm not sure"><span class="radio-label"><span class="radio-key">C</span> Not sure</span></label>
        </div>
      </div>
      <div>
        <div class="faith-q-label">Have you been water baptized?</div>
        <div class="radio-grid">
          <label class="radio-card"><input type="radio" name="waterBaptized" value="Yes"><span class="radio-label"><span class="radio-key">A</span> Yes</span></label>
          <label class="radio-card"><input type="radio" name="waterBaptized" value="No"><span class="radio-label"><span class="radio-key">B</span> No</span></label>
        </div>
      </div>
    </div>
    <div class="field-error" id="err-faith">Please answer all faith questions.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()">Back</button>
      <button class="btn-next" onclick="nextStep(4)">OK</button>
    </div>
  </div>
</div>

<!-- ===== STEP 5: Fellowship ===== -->
<!-- ===== STEP 4b: Student or Not ===== -->
<div class="screen" id="screen-4b">
  <div class="q-wrap">
    <div class="q-num">05</div>
    <div class="q-label">Are you a university student?</div>
    <div class="q-hint">This helps us show you the right fellowship options.</div>
    <div class="radio-grid">
      <label class="radio-card">
        <input type="radio" name="isStudent" value="yes">
        <span class="radio-label"><span class="radio-key">A</span> Yes, I'm a student</span>
      </label>
      <label class="radio-card">
        <input type="radio" name="isStudent" value="no">
        <span class="radio-label"><span class="radio-key">B</span> No, I'm not</span>
      </label>
    </div>
    <div class="field-error" id="err-isStudent">Please select an option.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()"> Back</button>
      <button class="btn-next" onclick="nextStep('4b')">OK </button>
      <span class="enter-hint">Press <kbd>Enter </kbd></span>
    </div>
  </div>
</div>

<div class="screen" id="screen-5">
  <div class="q-wrap">
    <div class="q-num">06</div>
    <div class="q-label">Which fellowship are you from?</div>
    <div class="q-hint">Select your campus or fellowship group.</div>
    <div id="fellowship-loading" class="loading-wrap">
          <div class="spinner"></div> Loading fellowships...
    </div>
    <input class="field-select" id="fellowship" list="fellowship-list" style="display:none" placeholder="Select or type your fellowship...">
    <datalist id="fellowship-list"></datalist>
    <div class="q-hint" id="fellowship-debug" style="margin-top:10px;"></div>
    <div class="field-error" id="err-fellowship">Please select your fellowship.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()">Back</button>
      <button class="btn-next" onclick="nextStep(5)">OK</button>
    </div>
  </div>
</div>

<!-- ===== STEP 6: Class Choice ===== -->
<div class="screen" id="screen-6">
  <div class="q-wrap">
    <div class="q-num">07</div>
    <div class="q-label">Choose your class time</div>
    <div class="q-hint">Pick the schedule that works best for you.</div>
    <div id="class-loading" class="loading-wrap">
      <div class="spinner"></div> Loading available classes...
    </div>
    <div class="class-grid" id="classGrid" style="display:none;max-height:300px;overflow-y:auto;padding-right:4px;"></div>
    <div class="field-error" id="err-class">Please select a class time.</div>
    <div class="q-actions">
      <button class="btn-back" onclick="goBack()">Back</button>
      <button class="btn-next" id="btn-submit" onclick="submitForm()">
        Submit <span id="submit-spinner" class="spinner" style="display:none;width:14px;height:14px;border-width:2px;"></span>
        <span id="submit-text"></span>
      </button>
    </div>
  </div>
</div>
<!-- ===== SUCCESS ===== -->
<div class="screen" id="screen-success">
  <div class="success-content">
    <div class="success-icon">🎉</div>
    <div class="success-title">You're in, <span id="success-name"></span>!</div>
    <p class="success-sub">Welcome to Rock Solid. Check your inbox - your class details are on their way.</p>
    <div class="summary-card" id="summary-card"></div>
  </div>
</div>

<script>
const CONFIG = {
  // ── Supabase ──────────────────────────────────────────────
  SUPABASE_URL:     'YOUR-PROJECT-REF',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',   // ← paste your anon key

  // ── Legacy (no longer used) ───────────────────────────────
  APPS_SCRIPT_URL:   '',
  CLASS_TIMEZONE:    'America/Toronto',
  MOODLE_URL:        'YOUR_MOODLE_URL',
  MOODLE_TOKEN:      'YOUR_MOODLE_TOKEN',
  MOODLE_COURSE_IDS: { CE: 2, CS: 3, WS: 4 },
  CLASS_OPTIONS_CSV: '',
  FELLOWSHIP_CSV:    '',
};

// ============================================================
//  STATE
// ============================================================
let currentStep = 0; // 0 = intro
const TOTAL_STEPS = 7;
const formData = {};
let fellowships = [];
let classes = [];
let classesLoaded = false;
let fellowshipTzMap = {};
let fellowshipLookup = {};
let classViewMode = 'normal';
let noClassOptionsShown = false;
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const TEMP_DRAFT_KEY = 'fsch_temp_draft_v1';
const TEMP_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const DATA_CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_KEYS = {
  fellowships: 'fsch_fellowships_v4_bulletproof',
  classes: 'fsch_classes_v4_bulletproof',
  submitGuard: 'fsch_submitted_guard_v1',
};

function setCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch (_) {}
}

function getCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.savedAt || Date.now() - Number(parsed.savedAt) > DATA_CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch (_) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 300) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(delayMs);
    }
  }
  throw lastErr || new Error('Fetch failed');
}

function saveTempDraft() {
  try {
    const { fellowshipCode, fellowshipName, classChoice, classLabel, classGroup, ...saveable } = formData;
    const payload = {
      savedAt: Date.now(),
      expiresAt: Date.now() + TEMP_DRAFT_TTL_MS,
      currentStep: currentStep === '4b' ? '4b' : Math.min(Number(currentStep) || 0, 5),
      formData: saveable,
    };
    sessionStorage.setItem(TEMP_DRAFT_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function loadTempDraft() {
  try {
    const rawDraft = sessionStorage.getItem(TEMP_DRAFT_KEY);
    if (!rawDraft) return null;
    const draft = JSON.parse(rawDraft);
    if (!draft || !draft.expiresAt || Date.now() > Number(draft.expiresAt)) {
      sessionStorage.removeItem(TEMP_DRAFT_KEY);
      return null;
    }
    return draft;
  } catch (_) {
    sessionStorage.removeItem(TEMP_DRAFT_KEY);
    return null;
  }
}

function clearTempDraft() {
  try { sessionStorage.removeItem(TEMP_DRAFT_KEY); } catch (_) {}
}

function formatPhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function bindTempDraftListeners() {
  const ids = ['firstName','lastName','email','emailConfirm','phone'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 'phone') {
        el.value = formatPhoneInput(el.value);
      }
      formData[id] = el.value.trim();
      saveTempDraft();
    });
  });

  ['bornAgain','tongues','waterBaptized'].forEach(name => {
    document.querySelectorAll(`input[name=${name}]`).forEach(el => {
      el.addEventListener('change', () => {
        formData[name] = el.value;
        saveTempDraft();
      });
    });
  });

  const fellowship = document.getElementById('fellowship');
  if (fellowship) {
    fellowship.addEventListener('change', () => {
      const match = resolveFellowshipSelection();
      formData.fellowshipCode = match?.code || '';
      formData.fellowshipName = match?.name || fellowship.value.trim();
      saveTempDraft();
    });
  }

  const classGrid = document.getElementById('classGrid');
  if (classGrid) {
    classGrid.addEventListener('change', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.name !== 'classChoice') return;
      formData.classChoice = target.value || '';
      formData.classLabel = target.dataset?.label || '';

      if (target.value === 'NONE') {
        renderClassesForSelectedFellowship('regionalOnly');
      } else if (classViewMode === 'regionalOnly') {
        renderClassesForSelectedFellowship('normal');
      }

      saveTempDraft();
    });
  }
}
function restoreUIFromState() {
  const byId = (id) => document.getElementById(id);
  if (byId('firstName')) byId('firstName').value = formData.firstName || '';
  if (byId('lastName')) byId('lastName').value = formData.lastName || '';
  if (byId('email')) byId('email').value = formData.email || '';
  if (byId('emailConfirm')) byId('emailConfirm').value = formData.emailConfirm || '';
  if (byId('phone')) byId('phone').value = formData.phone || '';

  if (formData.bornAgain) {
    document.querySelectorAll('input[name=bornAgain]').forEach(el => {
      el.checked = el.value === formData.bornAgain;
    });
  }
  if (formData.tongues) {
    document.querySelectorAll('input[name=tongues]').forEach(el => {
      el.checked = el.value === formData.tongues;
    });
  }
  if (formData.waterBaptized) {
    document.querySelectorAll('input[name=waterBaptized]').forEach(el => {
      el.checked = el.value === formData.waterBaptized;
    });
  }
  if (formData.isStudent !== null && formData.isStudent !== undefined) {
    document.querySelectorAll('input[name=isStudent]').forEach(el => {
      el.checked = (el.value === 'yes') === formData.isStudent;
    });
  }

  const fellowship = byId('fellowship');
  if (fellowship && formData.fellowshipCode) fellowship.value = formData.fellowshipCode;

  if (formData.classChoice) {
    document.querySelectorAll('input[name=classChoice]').forEach(el => {
      el.checked = el.value === formData.classChoice;
    });
  }
  updateDynamicLabels();
}
function parseCsvRow(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeText(v) {
  return String(v || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')     // remove accents
    .replace(/\u00A0/g, ' ')              // remove non-breaking spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove invisible zero-width chars
    .trim();
}

function normalizeCode(v) {
  return normalizeText(v)
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

function stripNonAlnum(v) {
  return normalizeText(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function lookupKey(v) {
  return stripNonAlnum(v);
}

function addFellowshipLookupKey(key, fellowship) {
  const cleaned = lookupKey(key);
  if (!cleaned) return;
  fellowshipLookup[cleaned] = fellowship;
}

function splitFellowshipCodes(value) {
  return normalizeText(value)
    // split common multi-code separators, but do not split hyphens inside names like U-OF-T
    .split(/[,;|/]+|\s+\+\s+|\s+&\s+|\s+and\s+/i)
    .map(v => normalizeText(v))
    .filter(Boolean);
}

function getFellowshipAliases(codeOrName) {
  const key = lookupKey(codeOrName);
  const direct = fellowshipLookup[key];
  if (!direct) return [key].filter(Boolean);
  return [direct.code, direct.name, key].map(lookupKey).filter(Boolean);
}

function classMatchesFellowship(classCode, selectedCode) {
  const selectedAliases = new Set(getFellowshipAliases(selectedCode));
  if (!selectedAliases.size) return false;

  return splitFellowshipCodes(classCode).some(part => {
    const partKey = lookupKey(part);
    if (!partKey) return false;

    // Direct code/name match
    if (selectedAliases.has(partKey)) return true;

    // If the class cell contains a campus name instead of code, resolve it through the lookup.
    const resolved = fellowshipLookup[partKey];
    if (resolved) {
      return getFellowshipAliases(resolved.code).some(alias => selectedAliases.has(alias));
    }

    return false;
  });
}

function isRegionalCode(v) {
  const code = normalizeCode(v);
  return code === 'REGIONAL' || code === 'REG' || code === 'REGALL';
}

function formatDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  }
  return raw;
}

function formatDisplayDay(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return raw;
}

function parseDateParts(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return { y: Number(m[3]), mo: Number(m[1]), d: Number(m[2]) };
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate() };
  return null;
}

function uniqueByCode(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach(r => {
    const code = String(r.code || '').trim();
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push(r);
  });
  return out;
}

function refreshFellowshipDropdown() {
  const loading = document.getElementById('fellowship-loading');
  const input = document.getElementById('fellowship');
  const list = document.getElementById('fellowship-list');
  if (!input || !list) return;

  fellowshipLookup = {};
  list.innerHTML = '';

  const sortedFellowships = [...fellowships].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  );

  sortedFellowships.forEach(f => {
    const code = normalizeText(f.code || '');
    const name = normalizeText(f.name || '');
    if (!code || !name) return;

    const fellowship = { code, name };

    const opt = document.createElement('option');
    opt.value = code;
    opt.label = name;
    list.appendChild(opt);

    // Bulletproof lookup: exact text, code, campus name, normalized no-space versions,
    // and code-name combinations all resolve to the same fellowship.
    [code, name, `${code} ${name}`, `${name} ${code}`].forEach(key => addFellowshipLookupKey(key, fellowship));
  });

  if (!fellowships.length) {
    const opt = document.createElement('option');
    opt.value = 'No fellowship options available. Please contact admin.';
    list.appendChild(opt);
  }

  if (formData.fellowshipCode) input.value = formData.fellowshipCode;
  if (loading) loading.style.display = 'none';
  input.style.display = '';
}

function resolveFellowshipSelection() {
  const input = document.getElementById('fellowship');
  const rawValue = normalizeText(input?.value || '');
  if (!rawValue) return null;

  const found = fellowshipLookup[lookupKey(rawValue)];
  if (found) return found;

  const rawKey = lookupKey(rawValue);
  const byContains = fellowships.find(f => {
    const codeKey = lookupKey(f.code);
    const nameKey = lookupKey(f.name);
    return codeKey === rawKey || nameKey === rawKey || nameKey.startsWith(rawKey) || rawKey.startsWith(nameKey);
  });
  if (byContains) return { code: normalizeText(byContains.code || ''), name: normalizeText(byContains.name || '') };

  return null;
}
function parseTimeParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (m) {
    let h = Number(m[1]);
    const mi = Number(m[2] || 0);
    const ap = (m[3] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return { h, mi };
  }
  m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m) {
    return { h: Number(m[1]), mi: Number(m[2]) };
  }
  return null;
}

function toDisplay12h(h, mi) {
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(mi).padStart(2, "0")} ${suffix}`;
}

function getTzOffsetMs(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUTC - instant.getTime();
}

function wallClockToInstant(dateParts, timeParts, timeZone) {
  // Treat the wall-clock time as naive UTC, then subtract the zone offset
  // to produce the real UTC instant. A second pass is applied only when the
  // offset itself changed (DST boundary crossing); otherwise one pass is exact.
  const naive = Date.UTC(dateParts.y, dateParts.mo - 1, dateParts.d, timeParts.h, timeParts.mi, 0);
  const offset1 = getTzOffsetMs(new Date(naive), timeZone);
  const adjusted = naive - offset1;
  const offset2 = getTzOffsetMs(new Date(adjusted), timeZone);
  return new Date(offset1 === offset2 ? adjusted : adjusted - offset2 + offset1);
}

function formatSessionLocal(cls) {
  const classTimeZone = String(cls.timezone || CONFIG.CLASS_TIMEZONE || "America/Toronto").trim();
  const fellowshipCode = String(cls.fellowshipCode || "").trim().toLowerCase();
  const teacher = cls.teacherName ? `Teacher: ${cls.teacherName}` : "";

  const isRegional = isRegionalCode(fellowshipCode);

  const dayRaw = String(cls.day || "").replace(/\bGMT[^\s)]*\s*(\([^)]*\))?/ig, " ");
  const timeRaw = String(cls.time || "").replace(/\bGMT[^\s)]*\s*(\([^)]*\))?/ig, " ");
  const combinedRaw = `${dayRaw} ${timeRaw}`;

  const weekdayMatch = combinedRaw.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  const cleanDay = (weekdayMatch ? weekdayMatch[1] : "").replace(/\uFFFD/g, "").trim();

  const timeMatches = [...timeRaw.matchAll(/\b(\d{1,2}:\d{2}\s*[AaPp][Mm])\b/g)];
  const dayMatches = [...dayRaw.matchAll(/\b(\d{1,2}:\d{2}\s*[AaPp][Mm])\b/g)];

  // Use FIRST match from the Time column to avoid picking up end-times from
  // ranges (e.g. "6:00 PM - 9:00 PM") or stray times in other fields.
  const chosenAmPm =
    (timeMatches.length ? timeMatches[0][1] : "") ||
    (dayMatches.length ? dayMatches[0][1] : "");

  const hhmm24Matches = [...timeRaw.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)];
  const chosen24 = hhmm24Matches.length ? hhmm24Matches[0] : null;

  let cleanTime = "";
  if (chosenAmPm) {
    cleanTime = chosenAmPm.toUpperCase().replace(/\s+/, " ").replace(/\uFFFD/g, "").trim();
  } else if (chosen24) {
    cleanTime = toDisplay12h(Number(chosen24[1]), Number(chosen24[2])).replace(/\uFFFD/g, "").trim();
  }

  const dParts = parseDateParts(cls.classStartDate);
  const tParts = parseTimeParts(cleanTime);
  if (!dParts || !tParts) {
    const fallbackBits = [cleanDay, cleanTime].filter(Boolean);
    const fallbackTitle = fallbackBits.length ? fallbackBits.join(" - ") : "Class time unavailable";
    return {
      title: `${isRegional ? "Regional — " : ""}${fallbackTitle}`,
      startLine: "",
      teacherLine: teacher,
      mismatch: false,
      originalLine: "",
    };
  }

  const instant = wallClockToInstant(dParts, tParts, classTimeZone);
  const localParts = new Intl.DateTimeFormat("en-US", {
    weekday: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: userTimeZone,
  }).formatToParts(instant);
  const weekday = (localParts.find(p => p.type === "weekday")?.value || "").trim();
  const hour = localParts.find(p => p.type === "hour")?.value || "";
  const minute = localParts.find(p => p.type === "minute")?.value || "";
  const period = (localParts.find(p => p.type === "dayPeriod")?.value || "").toUpperCase();
  const timePart = [hour && minute ? `${hour}:${minute}` : "", period].filter(Boolean).join(" ").trim();
  const startsLocal = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: userTimeZone,
  }).format(instant);
  const classDayTime = new Intl.DateTimeFormat("en-US", {
    weekday: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: classTimeZone,
  }).format(instant);
  const classTimeOnly = (classDayTime.split(",")[1] || "").trim();
  const tzAbbr = new Intl.DateTimeFormat("en-US", { timeZone: classTimeZone, timeZoneName: "short" })
    .formatToParts(instant).find(p => p.type === "timeZoneName")?.value || classTimeZone;
  const mismatch = classTimeZone !== userTimeZone;
  return {
    title: `${isRegional ? "Regional — " : ""}${weekday || cleanDay} - ${timePart || cleanTime}${mismatch ? " (Your Time)" : ""}`,
    startLine: `Starts: ${startsLocal}`,
    teacherLine: teacher,
    mismatch,
    originalLine: mismatch ? `Originally: ${classTimeOnly} ${tzAbbr}` : "",
  };
}

function showClassSkeleton() {
  const grid = document.getElementById('classGrid');
  const loading = document.getElementById('class-loading');
  if (!grid || !loading) return;
  loading.style.display = 'none';
  grid.style.display = '';
  grid.innerHTML = '<div class="class-skeleton"></div><div class="class-skeleton"></div><div class="class-skeleton"></div>';
}
// ============================================================
//  NAVIGATION
// ============================================================
function showScreen(id) {
  // Hide all
  document.querySelectorAll('.screen, #screen-intro').forEach(s => {
    s.classList.remove('active', 'exit-up', 'exit-down');
    if (s.id !== 'screen-intro') s.style.display = '';
  });

  const target = document.getElementById('screen-' + id);
  if (!target) return;
  target.classList.add('active');

  // Progress
  const visualStep =
    id === '4b' ? 4.5
    : (typeof id === 'number' ? id : Number(id) || 0);
  const pct = id === 'success' ? 100 : (id === 'intro' ? 0 : (visualStep / TOTAL_STEPS) * 100);
  document.getElementById('progressFill').style.width = pct + '%';

  // Nav
  const logo = document.getElementById('navLogo');
  const stepEl = document.getElementById('navStep');
  if (id === 'intro') {
    logo.classList.remove('visible');
    stepEl.textContent = '';
    stepEl.classList.remove('visible');
  } else {
    logo.classList.add('visible');
    if (id === 'success') {
      stepEl.textContent = 'Complete ✓';
    } else {
      const navStep = id === '4b' ? 5 : (typeof id === 'number' && id >= 5 ? id + 1 : id);
      stepEl.textContent = `${navStep} / ${TOTAL_STEPS}`;
    }
    stepEl.classList.add('visible');
  }

  if (id === 5) updateDynamicLabels();

  // Focus first input
  setTimeout(() => {
    const inp = target.querySelector('input[type=text], input[type=email], input[type=tel]');
    if (inp) inp.focus();
  }, 550);
}

function startForm() {
  const intro = document.getElementById('screen-intro');
  intro.classList.add('exit-up');
  setTimeout(() => { intro.style.display = 'none'; }, 550);
  currentStep = 1;
  showScreen(1);
  restoreUIFromState();
  saveTempDraft();
}

async function nextStep(step) {
  if (step === 4) {
    if (!validateStep(4)) return;
    collectData(4);
    currentStep = '4b';
    showScreen('4b');
    saveTempDraft();
    return;
  }
  if (step === '4b') {
    if (!validateStep('4b')) return;
    collectData('4b');
    currentStep = 5;
    if (!fellowships || fellowships.length === 0) {
      if (!classesLoaded) await loadClasses();
      if (!fellowships.length && classes.length) {
        const activeRows = classes.filter(cls => {
          const active = String(cls.active || '').trim().toLowerCase();
          return active === '' || active === 'true' || active === 'yes' || active === '1';
        });
        fellowships = uniqueByCode(activeRows.map(r => ({ code: r.fellowshipCode, name: r.fellowshipCode })));
      }
      refreshFellowshipDropdown();
    }
    showScreen(5);
    updateDynamicLabels();
    restoreUIFromState();
    saveTempDraft();
    return;
  }
  if (!validateStep(step)) return;
  collectData(step);
  currentStep = step + 1;
  if (step < TOTAL_STEPS) {
    if (step === 5 && !classesLoaded) {
      await loadClasses();
    }
    showScreen(step + 1);
    if (step === 3) await preloadData();
    if (step === 5) renderClassesForSelectedFellowship();
    updateDynamicLabels();
    restoreUIFromState();
    saveTempDraft();
  }
}

function goBack() {
  if (currentStep <= 1) {
    // Back to intro
    document.getElementById('screen-' + currentStep)?.classList.remove('active');
    const intro = document.getElementById('screen-intro');
    intro.style.display = '';
    intro.classList.remove('exit-up');
    intro.classList.add('active');
    // Trigger reflow
    void intro.offsetWidth;
    intro.classList.remove('active');
    setTimeout(() => {
      intro.classList.add('active');
    }, 10);
    currentStep = 0;
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('navLogo').classList.remove('visible');
    const stepEl = document.getElementById('navStep');
    stepEl.textContent = '';
    stepEl.classList.remove('visible');
    return;
  }
  if (currentStep === '4b') {
    currentStep = 4;
    showScreen(4);
  } else if (currentStep === 5) {
    currentStep = '4b';
    showScreen('4b');
  } else {
    currentStep = (typeof currentStep === 'number') ? currentStep - 1 : 4;
    showScreen(currentStep);
  }
  restoreUIFromState();
  saveTempDraft();
}

// ============================================================
//  KEYBOARD
// ============================================================
document.addEventListener('keydown', e => {
  const isActiveStep = currentStep === '4b' || (typeof currentStep === 'number' && currentStep > 0 && currentStep <= TOTAL_STEPS);
  if (e.key === 'Enter' && isActiveStep) {
    if (currentStep === TOTAL_STEPS) submitForm();
    else nextStep(currentStep);
  }
  // A/B shortcuts for radio
  if (['a','b','A','B'].includes(e.key) && isActiveStep) {
    const map = { a:0, b:1, A:0, B:1 };
    const screen = document.querySelector('#screen-' + currentStep);
    if (!screen) return;
    const radios = screen.querySelectorAll('.radio-card input');
    const idx = map[e.key];
    if (radios[idx]) { radios[idx].checked = true; radios[idx].dispatchEvent(new Event('change')); }
  }
});

// ============================================================
//  VALIDATION
// ============================================================
function validateStep(step) {
  let ok = true;
  const hide = id => { const e = document.getElementById(id); if(e) e.classList.remove('show'); };
  const show = id => { const e = document.getElementById(id); if(e) e.classList.add('show'); ok = false; };

  if (step === 1) {
    const first = document.getElementById('firstName').value.trim();
    const last = document.getElementById('lastName').value.trim();
    hide('err-firstName');
    hide('err-lastName');
    if (!first) show('err-firstName');
    if (!last) show('err-lastName');
  } else if (step === 2) {
    const v = document.getElementById('email').value.trim();
    const c = document.getElementById('emailConfirm').value.trim();
    hide('err-email');
    hide('err-emailConfirm');
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) show('err-email');
    if (!c || v.toLowerCase() !== c.toLowerCase()) show('err-emailConfirm');
  } else if (step === 3) {
    const v = document.getElementById('phone').value.trim();
    hide('err-phone');
    if (!v || v.replace(/\D/g,'').length < 10) show('err-phone');
  } else if (step === 4) {
    hide('err-faith');
    const ba = document.querySelector('input[name=bornAgain]:checked');
    const to = document.querySelector('input[name=tongues]:checked');
    const wb = document.querySelector('input[name=waterBaptized]:checked');
    if (!ba || !to || !wb) show('err-faith');
  } else if (step === '4b') {
    hide('err-isStudent');
    const sel = document.querySelector('input[name=isStudent]:checked');
    if (!sel) show('err-isStudent');
  } else if (step === 5) {
    hide('err-fellowship');
    const match = resolveFellowshipSelection();
    if (!match) show('err-fellowship');
  } else if (step === 6) {
    hide('err-class');
    const sel = document.querySelector('input[name=classChoice]:checked');
    if (!sel && !noClassOptionsShown) show('err-class');
  }
  return ok;
}

// ============================================================
//  COLLECT
// ============================================================
function collectData(step) {
  if (step === 1) {
    formData.firstName = document.getElementById('firstName').value.trim();
    formData.lastName  = document.getElementById('lastName').value.trim();
  }
  if (step === 2) {
    formData.email = document.getElementById('email').value.trim();
    formData.emailConfirm = document.getElementById('emailConfirm').value.trim();
  }
  if (step === 3) formData.phone     = document.getElementById('phone').value.trim();
  if (step === 4) {
    formData.bornAgain     = document.querySelector('input[name=bornAgain]:checked')?.value;
    formData.tongues       = document.querySelector('input[name=tongues]:checked')?.value;
    formData.waterBaptized = document.querySelector('input[name=waterBaptized]:checked')?.value;
  }
  if (step === '4b') {
    const sel = document.querySelector('input[name=isStudent]:checked');
    formData.isStudent = sel ? sel.value === 'yes' : null;
  }
  if (step === 5) {
    const match = resolveFellowshipSelection();
    formData.fellowshipCode = match?.code || '';
    formData.fellowshipName = match?.name || '';
  }
}

function updateDynamicLabels() {
  const label = document.querySelector('#screen-5 .q-label');
  const hint  = document.querySelector('#screen-5 .q-hint');
  if (!label || !hint) return;

  if (formData.isStudent === false) {
    label.textContent = 'Which church are you from?';
    hint.textContent  = 'Select the church associated with your campus.';
  } else {
    label.textContent = 'Which fellowship are you from?';
    hint.textContent  = 'Select your campus or fellowship group.';
  }
}

// ============================================================
//  FELLOWSHIPS
// ============================================================
async function loadFellowships() {
  const loading = document.getElementById('fellowship-loading');
  const sel = document.getElementById('fellowship');
  const debug = document.getElementById('fellowship-debug');
  const noDataLabel = 'No fellowship options available. Please contact admin.';
  fellowships = [];
  fellowshipTzMap = {};

  const cachedFellowships = getCache(CACHE_KEYS.fellowships);
  if (cachedFellowships) {
    try {
      fellowships = Array.isArray(cachedFellowships) ? cachedFellowships : [];
      fellowshipTzMap = {};
      fellowships.forEach(f => {
        fellowshipTzMap[String(f.code || '').toLowerCase()] = String(f.timezone || '').trim();
      });
      refreshFellowshipDropdown();
      return;
    } catch (_) {}
  }

  if (debug) debug.textContent = '';
  try {
    // ── Load fellowships from Supabase ──────────────────────
    const res = await fetch(
      `${CONFIG.SUPABASE_URL}/rest/v1/fellowship_map?active=eq.true&select=fellowship_code,campus_name,group_id,subgroup_id,timezone&order=campus_name`,
      { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error('Failed to load fellowships');
    const data = await res.json();
    fellowships = data.map(r => ({
      code:      r.fellowship_code,
      name:      r.campus_name,
      groupId:   r.group_id,
      subgroupId:r.subgroup_id,
      active:    'true',
      timezone:  r.timezone || 'America/Toronto'
    }));
    setCache(CACHE_KEYS.fellowships, fellowships);
    fellowshipTzMap = {};
    fellowships.forEach(f => {
      fellowshipTzMap[String(f.code || '').toLowerCase()] = String(f.timezone || '').trim();
    });
    if (debug) debug.textContent = '';
  } catch (err) {
    fellowships = [];
    fellowshipTzMap = {};
    if (debug) debug.textContent = '';
  }

  refreshFellowshipDropdown();
}
async function loadClasses() {
  const loading = document.getElementById('class-loading');
  const grid = document.getElementById('classGrid');
  classes = [];
  classesLoaded = false;

  try {
    // ── Load class options from Supabase ────────────────────
    showClassSkeleton();
    const res = await fetch(
      `${CONFIG.SUPABASE_URL}/rest/v1/class_options?active=eq.true&enrollment_open=eq.true&deleted_at=is.null&select=class_option_id,class_id,fellowship_codes,teacher_id,teacher_name,day,class_time,active`,
      { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error('Failed to load class options');
    const data = await res.json();
    classes = data.map(r => {
      // fellowship_codes comes as a PG array string like {CMU,YORK}
      const rawCodes = String(r.fellowship_codes || '{}').replace(/^\{|\}$/g, '');
      const fellowshipCode = rawCodes; // keep as comma-separated for matching
      const firstCode = rawCodes.split(',')[0]?.trim().toLowerCase();
      return {
        id:            r.class_option_id,
        fellowshipCode: rawCodes,
        teacherId:     r.teacher_id || '',
        teacherName:   r.teacher_name || '',
        day:           r.day || '',
        time:          r.class_time || '',
        active:        'true',
        classStartDate:'',
        timezone:      fellowshipTzMap[firstCode] || 'America/Toronto'
      };
    });
  } catch (err) {
    classes = [];
    if (grid) {
      grid.innerHTML = `<div class="field-error show">Could not load class options: ${String(err.message || err)}</div>`;
    }
  }

  classesLoaded = true;
  loading.style.display = 'none';
  grid.style.display = '';

  if (formData.fellowshipCode) {
    renderClassesForSelectedFellowship();
  }
}
function renderClassesForSelectedFellowship(mode = classViewMode) {
  const grid = document.getElementById('classGrid');
  const loading = document.getElementById('class-loading');
  classViewMode = mode === 'regionalOnly' ? 'regionalOnly' : 'normal';
  const selectedCode = String(formData.fellowshipCode || '').trim();
  grid.innerHTML = '';
  loading.style.display = 'none';
  grid.style.display = '';

  const activeRows = classes.filter(cls => {
    const active = String(cls.active || '').trim().toLowerCase();
    return active === '' || active === 'true' || active === 'yes' || active === '1';
  });

  let filtered = activeRows.filter(cls => classMatchesFellowship(cls.fellowshipCode, selectedCode));

  const regionalRows = activeRows.filter(cls => isRegionalCode(cls.fellowshipCode));
  if (classViewMode === 'regionalOnly') {
    filtered = activeRows.filter(cls => isRegionalCode(cls.fellowshipCode));
  } else if (!filtered.length) {
    filtered = regionalRows;
    const fallback = document.createElement('div');
    fallback.className = 'q-hint';
    fallback.style.marginBottom = '8px';
    fallback.textContent = 'No campus-specific class is active for your fellowship yet, so regional options are shown.';
    grid.appendChild(fallback);
  }

  if (classViewMode === 'regionalOnly') {
    const heading = document.createElement('div');
    heading.className = 'q-hint';
    heading.style.marginBottom = '8px';
    heading.textContent = 'Regional class options';
    grid.appendChild(heading);
  }

  noClassOptionsShown = !filtered.length && regionalRows.length === 0;
  if (noClassOptionsShown) {
    formData.availability = 'NO_CLASS_AVAILABLE';
    const empty = document.createElement('div');
    empty.className = 'q-hint class-card-label';
    empty.textContent = 'No class times are currently available. Our schedule will be updated soon, and we will contact you when your options are released.';
    grid.appendChild(empty);
  } else if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'q-hint';
    empty.textContent = 'No active class options available for this fellowship.';
    grid.appendChild(empty);
  } else {
    formData.availability = '';
    filtered.forEach(cls => {
      const session = formatSessionLocal(cls);
      const classLine = [session.title, (session.teacherLine || '').replace(/^Teacher:\s*/i, '')].filter(Boolean).join(' . ');
      const classLabel = classLine;
      const checkedAttr = formData.classChoice === cls.id ? 'checked' : '';
      const card = document.createElement('label');
      card.className = 'class-card';
      card.innerHTML = `
        <input type="radio" name="classChoice" value="${cls.id}" data-group="" data-label="${classLabel}" data-teacher-email="${cls.teacherEmail || ''}" ${checkedAttr}>
        <div class="class-card-label">
          <div class="class-info">
            <div class="class-name">${classLine}</div>
            ${session.startLine ? `<div class="class-time">${session.startLine}</div>` : ''}
            ${session.mismatch ? `<div class="class-time">${session.originalLine}</div>` : ''}
          </div>
        </div>`;
      grid.appendChild(card);
    });
  }

  const none = document.createElement('label');
  none.className = 'class-card';
  none.innerHTML = `
    <input type="radio" name="classChoice" value="NONE" data-group="" data-label="None of these times work for me" ${formData.classChoice === 'NONE' ? 'checked' : ''}>
    <div class="class-card-label">
      <div class="class-info">
        <div class="class-name" style="color:var(--muted)">None of these times work</div>
        <div class="class-time">I'll wait for the next intake</div>
      </div>
    </div>`;
  grid.appendChild(none);
}
async function preloadData() {
  // fellowships MUST finish first — loadClasses reads fellowshipTzMap
  // which is empty until loadFellowships completes.
  await loadFellowships();
  await loadClasses();
}

// ============================================================
//  SUBMIT
// ============================================================
async function submitForm() {
  if (sessionStorage.getItem(CACHE_KEYS.submitGuard)) {
    const proceed = window.confirm(
      'This registration was already submitted in this browser session. Submit again anyway?'
    );
    if (!proceed) return;
  }

  if (!validateStep(6)) return;

  const sel = document.querySelector('input[name=classChoice]:checked');

  formData.classChoice =
    sel?.value || (noClassOptionsShown ? 'NO_CLASS_AVAILABLE' : '');

  formData.classGroup =
    sel?.dataset?.group || '';

  formData.classLabel =
    sel?.dataset?.label || formData.classChoice;

  const selectedClass =
    classes.find(
      c => String(c.id || '') === String(formData.classChoice || '')
    ) || null;

  const selectedSession =
    selectedClass ? formatSessionLocal(selectedClass) : null;

  const selectedFellowship =
    fellowships.find(
      f =>
        String(f.code || '').toLowerCase() ===
        String(formData.fellowshipCode || '').toLowerCase()
    ) || null;

  const subgroup =
    String(
      (selectedFellowship &&
        (selectedFellowship.groupId ||
          selectedFellowship.subgroupId)) || ''
    )
      .trim()
      .toUpperCase();

  const browserTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || '';

  const classTimezone =
    String(
      (selectedClass && selectedClass.timezone) ||
      fellowshipTzMap[
        String(formData.fellowshipCode || '').toLowerCase()
      ] ||
      browserTimezone ||
      CONFIG.CLASS_TIMEZONE ||
      ''
    ).trim();

  const classTime =
    selectedSession ? (selectedSession.title || '') : '';

  const classStartDate =
    selectedClass
      ? String(selectedClass.classStartDate || '')
      : '';

  const teacherName =
    selectedClass
      ? String(selectedClass.teacherName || '')
      : '';

  const classId =
    selectedClass
      ? String(selectedClass.id || '')
      : '';

  const btn = document.getElementById('btn-submit');

  document.getElementById('submit-text').textContent =
    'Submitting';

  document.getElementById('submit-spinner').style.display =
    'inline-block';

  btn.disabled = true;

  const payload = {
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    phone: formData.phone,

    fellowshipName:
      formData.fellowshipName || '',

    fellowshipCode:
      formData.fellowshipCode,

    classChoice:
      formData.classChoice || '',

    classLabel:
      formData.classLabel || '',

    classTime:
      classTime || '',

    classStartDate:
      classStartDate || '',

    teacherName:
      teacherName || '',

    classId:
      classId || '',

    batchId: '',

    attendeeType:
      formData.isStudent === true
        ? 'student'
        : (
            formData.isStudent === false
              ? 'non-student'
              : ''
          ),

    subgroup:
      subgroup || '',

    timezone:
      classTimezone ||
      browserTimezone ||
      '',

    availability:
      formData.availability ||
      (
        formData.classChoice === 'NONE'
          ? 'NONE_SELECTED'
          : ''
      ),

    bornAgain:
      formData.bornAgain,

    speaksInTongues:
      formData.tongues,

    waterBaptized:
      formData.waterBaptized,

    submittedAt:
      new Date().toISOString(),
  };

  let sheetsOk = false;
  let mailchimpReason = '';

  try {

    const fullName =
      `${payload.firstName || ''} ${payload.lastName || ''}`.trim();

    const res = await fetch(
      `${CONFIG.SUPABASE_URL}/functions/v1/registration-processor`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Authorization':
            `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        },

        body: JSON.stringify({
          full_name: fullName,

          email:
            payload.email,

          phone:
            payload.phone || '',

          fellowship_code:
            payload.fellowshipCode || null,

          class_option_id:
            payload.classId || null,

          batch_id:
            payload.batchId || null,

          first_name:
            payload.firstName,

          last_name:
            payload.lastName,

          born_again:
            payload.bornAgain,

          speaks_in_tongues:
            payload.speaksInTongues,

          water_baptized:
            payload.waterBaptized,

          class_label:
            payload.classLabel,

          class_time:
            payload.classTime,

          teacher_name:
            payload.teacherName,

          timezone:
            payload.timezone,

          attendee_type:
            payload.attendeeType,

          availability:
            payload.availability
        })
      }
    );

    const result = await res.json();

    if (!result.ok) {
      throw new Error(
        result.error || 'Registration failed'
      );
    }

    sheetsOk = true;
try {

  await fetch(
    `${CONFIG.SUPABASE_URL}/functions/v1/mailchimp-sync`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'Authorization':
          `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
      },

      body: JSON.stringify({
        limit: 1,
        email: payload.email
      })
    }
  );

} catch (mailchimpErr) {

  console.error(
    'MAILCHIMP_SYNC_TRIGGER_FAILED',
    mailchimpErr
  );

}
  } catch (err) {

  sheetsOk = false;

  console.error(
    'Registration processor error:',
    err
  );

  alert(
    err.message ||
    'Registration failed. Please try again.'
  );

  btn.disabled = false;

  document.getElementById('submit-spinner').style.display =
    'none';

  document.getElementById('submit-text').textContent =
    '';

  return;
}



  if (sheetsOk) {
    sessionStorage.setItem(
      CACHE_KEYS.submitGuard,
      '1'
    );
  }

  sessionStorage.removeItem(
    CACHE_KEYS.fellowships
  );

  sessionStorage.removeItem(
    CACHE_KEYS.classes
  );

  const successData = { ...formData };

clearTempDraft();

showSuccess(successData);

Object.keys(formData).forEach(k =>
  delete formData[k]
);
  currentStep = 0;

  fellowships = [];

  fellowshipTzMap = {};

  classes = [];

  classesLoaded = false;

  noClassOptionsShown = false;
}
// ============================================================
//  SUCCESS
// ============================================================

function showSuccess(data = {}) {

  const fullName =
    `${data.firstName || ''} ${data.lastName || ''}`.trim();

  // ===== Name =====
  const successName =
    document.getElementById('success-name');

  if (successName) {
    successName.textContent =
      data.firstName || fullName || 'Friend';
  }

  // ===== Progress =====
  const progressFill =
    document.getElementById('progressFill');

  if (progressFill) {
    progressFill.style.width = '100%';
  }

  // ===== Nav =====
  const navStep =
    document.getElementById('navStep');

  if (navStep) {
    navStep.textContent = 'Complete ✓';
    navStep.classList.add('visible');
  }

  // ===== Summary =====
  const summary =
    document.getElementById('summary-card');

  if (summary) {

    summary.innerHTML = `
      <div class="summary-row">
        <span class="summary-key">Name</span>
        <span class="summary-val">${fullName || '—'}</span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Email</span>
        <span class="summary-val">${data.email || '—'}</span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Phone</span>
        <span class="summary-val">${data.phone || '—'}</span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Fellowship</span>
        <span class="summary-val">
          ${data.fellowshipName || data.fellowshipCode || '—'}
        </span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Class</span>
        <span class="summary-val">
          ${data.classLabel || data.classChoice || '—'}
        </span>
      </div>
    `;
  }

  showScreen('success');

  launchConfetti();
}
// ============================================================
//  CONFETTI
// ============================================================
function launchConfetti() {
  const container = document.getElementById('confetti');
  const colors = ['#4C2A92','#8E63C7','#F4BE41','#FCE7AE','#321B66','#CDB5EA'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `left:${Math.random()*100}%;width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>0.5?'50%':'3px'};animation-duration:${1.5+Math.random()*2.5}s;animation-delay:${Math.random()*0.8}s;`;
    container.appendChild(p);
  }
  setTimeout(() => container.innerHTML = '', 5000);
}

// ============================================================
//  FLOATING DOTS
// ============================================================
function initDots() {
  const df = document.getElementById('dotField');
  if (!df) return;
  for (let i = 0; i < 20; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    const size = 4 + Math.random() * 12;
    d.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${20+Math.random()*80}%;animation-duration:${4+Math.random()*6}s;animation-delay:${Math.random()*5}s;`;
    df.appendChild(d);
  }
}

// ============================================================
//  INIT
// ============================================================
window.addEventListener('load', async () => {
  initDots();
  bindTempDraftListeners();
  await preloadData();

  // Don't restore draft if the user already submitted in this session
  if (sessionStorage.getItem(CACHE_KEYS.submitGuard)) return;

  const draft = loadTempDraft();
  if (!draft) return;

  // Only show the banner if there's meaningful progress to restore (step > 0)
  const restoredStepRaw = draft.currentStep;
  const restoredStep = restoredStepRaw === '4b' ? '4b' : Number(restoredStepRaw || 0);
  const hasRestorableStep = restoredStep === '4b' || (typeof restoredStep === 'number' && restoredStep > 0);
  if (hasRestorableStep) {
    const banner = document.getElementById('welcome-back-banner');
    if (banner) {
      banner.style.display = '';
      setTimeout(() => { banner.style.display = 'none'; }, 3200);
    }
  }

  Object.assign(formData, draft.formData || {});
  currentStep = restoredStep;
  restoreUIFromState();
  updateDynamicLabels();

  const shouldResume = currentStep === '4b' || (typeof currentStep === 'number' && currentStep > 0);
  if (shouldResume) {
    const intro = document.getElementById('screen-intro');
    if (intro) intro.style.display = 'none';
    showScreen(currentStep);
    if (typeof currentStep === 'number' && currentStep >= 6) renderClassesForSelectedFellowship();
    restoreUIFromState();
  }
});
</script>
  <script src="../ui/premium-shell.js"></script>
</body>
</html>




