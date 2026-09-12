"use client";

import { useState } from "react";
import { DECADES, type WorldRequest } from "../lib/frontend-types";

export function CityDecadeForm({
  onSubmit,
  previewEnabled,
  initial,
}: {
  onSubmit: (request: WorldRequest, preview?: boolean) => void;
  previewEnabled: boolean;
  initial?: WorldRequest;
}) {
  const [city, setCity] = useState(initial?.city ?? "Amsterdam");
  const [decade, setDecade] = useState(initial?.decade ?? 1960);
  return (
    <form
      className="journey-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (city.trim()) onSubmit({ city: city.trim(), decade });
      }}
    >
      <div className="field">
        <label htmlFor="city">
          <span>01</span> Where do you want to go?
        </label>
        <input
          id="city"
          name="city"
          placeholder="City, country"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
          maxLength={120}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="decade">
          <span>02</span> Choose your decade
        </label>
        <div className="select-wrap">
          <select
            id="decade"
            name="decade"
            value={decade}
            onChange={(event) => setDecade(Number(event.target.value))}
          >
            {DECADES.map((year) => (
              <option key={year} value={year}>
                {year}s
              </option>
            ))}
          </select>
          <span aria-hidden="true">⌄</span>
        </div>
      </div>
      <button className="button primary explore-button" type="submit" disabled={!city.trim()}>
        Explore this era <span aria-hidden="true">↗</span>
      </button>
      <p className="form-note">Historical photo coverage varies by city and decade.</p>
      {previewEnabled && (
        <button
          className="preview-link"
          type="button"
          disabled={!city.trim()}
          onClick={() => onSubmit({ city: city.trim(), decade }, true)}
        >
          Try a local UI preview <span aria-hidden="true">→</span>
        </button>
      )}
    </form>
  );
}
