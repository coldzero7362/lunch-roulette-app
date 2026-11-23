import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weightOf } from '../../resources/js/roulette/logic/pick.js';
import { badWeather, distanceFactor } from '../../resources/js/roulette/logic/weather.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

describe('badWeather', () => {
    it('flags rain by amount or probability first', () => {
        assert.equal(badWeather({ rain: 0.5, prob: 10, feels: 35 }), 'rain');
        assert.equal(badWeather({ rain: 0, prob: 70, feels: 20 }), 'rain');
    });

    it('flags heat and cold by feels-like temperature', () => {
        assert.equal(badWeather({ rain: 0, prob: 0, feels: 31 }), 'hot');
        assert.equal(badWeather({ rain: 0, prob: 0, feels: -5 }), 'cold');
        assert.equal(badWeather({ rain: 0.1, prob: 30, feels: 12 }), null);
        assert.equal(badWeather(undefined), null);
    });
});

describe('distanceFactor', () => {
    it('keeps near places, falls linearly to 0.35 at the radius', () => {
        assert.equal(distanceFactor(150, 500), 1);
        assert.equal(distanceFactor(200, 500), 1);
        near(distanceFactor(350, 500), 0.675);
        assert.equal(distanceFactor(500, 500), 0.35);
        assert.equal(distanceFactor(700, 500), 0.35);
    });

    it('uses 40% of a small radius as the near zone', () => {
        assert.equal(distanceFactor(120, 300), 1);
        near(distanceFactor(210, 300), 0.675);
        near(distanceFactor(600, 1000), 0.675);
    });

    it('multiplies into the pick weight only when near is given', () => {
        const far = { id: 'a', type: '한식', category: '국밥', distance: 500 };
        assert.equal(weightOf(far, []), 1);
        assert.equal(weightOf(far, [], { near: 500 }), 0.35);
    });
});
