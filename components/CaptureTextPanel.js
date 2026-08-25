// components/CaptureTextPanel.js
'use client';

// Text + Voice input surface for the capture bar. Voice is text with a
// microphone: a final transcript is dropped into the same field and goes through
// the exact Text-mode submit — there is no separate voice pipeline.
//
// Flow: text -> POST /api/intent -> proposal -> render by status:
//   PROPOSE  -> CaptureConfirmCard  (commit only fires on the Confirm tap)
//   FALLBACK -> CaptureFallbackForm (guided form, Save commits)
//   REJECT   -> inline reason, field kept, no write
// The only write call made here is commitProposal().

import { useEffect, useRef, useState } from 'react';
import { commitProposal } from '../lib/commitProposal';
import CaptureConfirmCard from './CaptureConfirmCard';
import CaptureFallbackForm from './CaptureFallbackForm';

const INK = '#2A2932';
const MUTED = '#5B5966';
const HAIRLINE = '#E7DFD4';
const PINK = '#E7A6B5';

const eyebrowStyle = { fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 };
const inputStyle = {
  width: '100%', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '12px 14px',
  fontSize: 15, fontFamily: 'inherit', color: INK, background: '#FFFFFF', boxSizing: 'border-box',
};

function successMessage(proposal) {
  switch (proposal.intent) {
    case 'add_stock': return 'Added.';
    case 'bin_stock': return 'Binned.';
    case 'log_spend': {
      const pence = proposal.args && proposal.args.amountPence;
      return typeof pence === 'number' ? `Logged £${(pence / 100).toFixed(2)}.` : 'Logged.';
    }
    case 'log_weight':
    case 'log_off_plan':
    default:
      return 'Logged.';
  }
}

function rejectShell(reason) {
  return { status: 'REJECT', intent: null, action: null, args: {}, display: '', confidence: 0, reason, alternatives: [] };
}

export default function CaptureTextPanel({ mode, ingredients, onToast, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [commitError, setCommitError] = useState(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const inputRef = useRef(null);
  const recogRef = useRef(null);

  const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : undefined;
  const voiceSupported = Boolean(SR);

  // Focus the field when the mode opens.
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, [mode]);

  // Stop listening if the panel unmounts mid-capture.
  useEffect(() => () => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch { /* already stopped */ } }
  }, []);

  const startListening = () => {
    if (!voiceSupported || listening) return;
    const recog = new SR();
    recog.lang = 'en-GB';
    recog.interimResults = true;
    recog.continuous = false;
    recog.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) {
          // KIMI NOTE: spec §7 says the final transcript drops into the text field
          // and the user can edit before it sends — so we fill the field and leave
          // the send to the same submit button/Enter as Text mode (never auto-send).
          const finalText = res[0].transcript.trim();
          setText((prev) => (prev ? `${prev} ${finalText}` : finalText));
          setInterim('');
          setProposal(null);
        } else {
          interimText += res[0].transcript;
        }
      }
      if (interimText) setInterim(interimText);
    };
    recog.onerror = () => { setListening(false); setInterim(''); };
    recog.onend = () => { setListening(false); setInterim(''); };
    recogRef.current = recog;
    setInterim('');
    setListening(true);
    try { recog.start(); } catch { setListening(false); }
  };

  const stopListening = () => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch { /* already stopped */ } }
  };

  const submit = async () => {
    const utterance = text.trim();
    if (!utterance || busy) return;
    setBusy(true);
    setCommitError(null);
    setProposal(null);
    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utterance, ingredients }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !body.status) {
        setProposal(rejectShell((body && body.reason) || 'Something went wrong reading that — try rephrasing.'));
      } else {
        setProposal(body);
      }
    } catch {
      setProposal(rejectShell('Network error — check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  // The single commit path for PROPOSE (Confirm) and FALLBACK (Save).
  const commit = async (toCommit) => {
    if (busy) return;
    setBusy(true);
    setCommitError(null);
    const { error } = await commitProposal(toCommit);
    setBusy(false);
    if (error) {
      // Keep the card/form open so the user can retry or cancel.
      setCommitError(typeof error === 'string' ? error : (error.message || 'Could not save that — try again.'));
      return;
    }
    onToast(successMessage(toCommit));
    onClose();
  };

  const showComposer = !proposal || proposal.status === 'REJECT';

  return (
    <div>
      <div style={eyebrowStyle}>{mode === 'voice' ? 'Say it' : 'Type it'}</div>

      {mode === 'voice' ? (
        voiceSupported ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              style={{
                border: `1.5px solid ${listening ? PINK : HAIRLINE}`, borderRadius: 100,
                background: listening ? PINK : '#FFFFFF', color: INK,
                padding: '8px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {listening ? 'Stop' : 'Start talking'}
            </button>
            {listening ? (
              <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
                <span style={{ color: PINK }}>●</span> Listening…
              </span>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
            Voice isn&apos;t supported here — type instead.
          </div>
        )
      ) : null}

      {interim ? (
        <div style={{ fontSize: 14, color: MUTED, fontStyle: 'italic', marginBottom: 8 }}>{interim}</div>
      ) : null}

      {showComposer ? (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); if (proposal) setProposal(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="add 2 chicken breasts to the freezer"
            style={inputStyle}
          />
          {proposal && proposal.status === 'REJECT' ? (
            <div style={{ fontSize: 13, color: '#a00000', marginTop: 8 }}>
              {proposal.reason || 'Could not understand that — try rephrasing.'}
            </div>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text.trim()}
            style={{
              marginTop: 12, background: PINK, color: INK, border: 'none', borderRadius: 100,
              padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: busy || !text.trim() ? 0.6 : 1,
            }}
          >
            {busy ? 'Checking…' : 'Check it'}
          </button>
        </div>
      ) : null}

      {proposal && proposal.status === 'PROPOSE' ? (
        <CaptureConfirmCard
          proposal={proposal}
          busy={busy}
          error={commitError}
          onConfirm={() => commit(proposal)}
          onCancel={() => { setProposal(null); setCommitError(null); }}
        />
      ) : null}

      {proposal && proposal.status === 'FALLBACK' ? (
        <CaptureFallbackForm
          proposal={proposal}
          ingredients={ingredients}
          busy={busy}
          error={commitError}
          onSave={(nextArgs) => commit({ ...proposal, args: nextArgs })}
          onCancel={() => { setProposal(null); setCommitError(null); }}
        />
      ) : null}
    </div>
  );
}
