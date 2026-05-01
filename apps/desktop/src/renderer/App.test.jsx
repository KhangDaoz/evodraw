import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';

describe('App Component', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.style = '';
    
    // Mock window.electronAPI
    let modeCallback = null;
    window.electronAPI = {
      getDrawingMode: vi.fn().mockResolvedValue(false),
      onDrawingModeChanged: vi.fn((cb) => {
        modeCallback = cb;
      }),
      // Helper to trigger callback in tests
      triggerModeChange: (mode) => {
        if (modeCallback) modeCallback(mode);
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly in passthrough mode by default', async () => {
    await act(async () => {
      render(<App />);
    });
    
    expect(screen.getByText(/Click-through/i)).toBeInTheDocument();
    expect(document.body.style.pointerEvents).toBe('none');
  });

  it('changes to drawing mode when electronAPI triggers change', async () => {
    await act(async () => {
      render(<App />);
    });

    // Verify initial state
    expect(screen.getByText(/Click-through/i)).toBeInTheDocument();

    // Trigger change
    await act(async () => {
      window.electronAPI.triggerModeChange(true);
    });

    expect(screen.getByText(/Drawing Mode/i)).toBeInTheDocument();
    expect(document.body.style.pointerEvents).toBe('auto');
    expect(document.body.style.cursor).toBe('crosshair');
  });
});
