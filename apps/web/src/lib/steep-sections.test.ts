import { describe, expect, it } from 'vitest';
import { findSteepSections } from './steep-sections';

describe('steep section detection', () => {
  it('finds sustained climbs and descents with signed average grades', () => {
    const samples = [0, 30, 60, 90, 120, 150, 180].map((distanceMeters) => ({
      distanceMeters,
      elevationMeters:
        distanceMeters <= 90
          ? distanceMeters / 3
          : 30 - (distanceMeters - 90) / 3,
    }));
    expect(findSteepSections(samples)).toEqual([
      {
        direction: 'climb',
        startDistanceMeters: 0,
        endDistanceMeters: 90,
        gradePercent: 33.33333333333333,
      },
      {
        direction: 'descent',
        startDistanceMeters: 90,
        endDistanceMeters: 180,
        gradePercent: -33.33333333333333,
      },
    ]);
  });

  it('ignores brief spikes and single long intervals', () => {
    expect(
      findSteepSections([
        { distanceMeters: 0, elevationMeters: 0 },
        { distanceMeters: 30, elevationMeters: 5 },
        { distanceMeters: 60, elevationMeters: 0 },
        { distanceMeters: 200, elevationMeters: 20 },
      ]),
    ).toEqual([]);
  });

  it('does not bridge missing elevation samples', () => {
    const samples = [
      { distanceMeters: 0, elevationMeters: 0 },
      { distanceMeters: 30, elevationMeters: 4 },
      { distanceMeters: 60, elevationMeters: 8 },
      { distanceMeters: 90, elevationMeters: null },
      { distanceMeters: 120, elevationMeters: 20 },
      { distanceMeters: 150, elevationMeters: 24 },
      { distanceMeters: 180, elevationMeters: 28 },
    ];
    const sections = findSteepSections(samples);
    expect(sections).toHaveLength(2);
    expect(
      sections.map(({ startDistanceMeters, endDistanceMeters }) => [
        startDistanceMeters,
        endDistanceMeters,
      ]),
    ).toEqual([
      [0, 60],
      [120, 180],
    ]);
  });

  it('ignores flat grades and invalid distance steps', () => {
    expect(
      findSteepSections([
        { distanceMeters: 0, elevationMeters: 0 },
        { distanceMeters: 0, elevationMeters: 10 },
        { distanceMeters: 60, elevationMeters: 10 },
      ]),
    ).toEqual([]);
  });
});
