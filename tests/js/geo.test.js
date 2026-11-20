import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accuracyLabel, distanceM, worthMoving } from '../../resources/js/roulette/logic/geo.js';

const cityHall = { lat: 37.5665, lng: 126.978 };

describe('distanceM', () => {
    it('measures short distances in metres', () => {
        assert.equal(Math.round(distanceM(cityHall, cityHall)), 0);
        // 위도 0.001° ≈ 111m
        assert.ok(Math.abs(distanceM(cityHall, { lat: 37.5675, lng: 126.978 }) - 111) < 1);
    });
});

describe('worthMoving', () => {
    const first = { ...cityHall, accuracy: 1200 };

    it('moves when the fix is much tighter and somewhere else', () => {
        assert.equal(worthMoving(first, { lat: 37.5685, lng: 126.979, accuracy: 40 }), true);
    });

    it('stays when the accuracy barely improved', () => {
        assert.equal(worthMoving(first, { lat: 37.5685, lng: 126.979, accuracy: 1000 }), false);
    });

    it('stays when the better fix is basically the same spot', () => {
        assert.equal(worthMoving(first, { lat: 37.5666, lng: 126.978, accuracy: 40 }), false);
    });
});

describe('accuracyLabel', () => {
    it('formats metres and kilometres', () => {
        assert.equal(accuracyLabel(45.4), '±45m');
        assert.equal(accuracyLabel(1234), '±1.2km');
    });
});
