import assert from 'node:assert/strict';
import {METRICS, normalizeMeldingStatistics, displayMetric, metricDetail} from '../assets/js/stat-metrics.js';
const row={
 player_id:'a42df3bb-0f8f-47fb-ad64-d21fcb0cf36e',player_name:'Johan',is_guest:false,
 games_played:10, net_points:'3.5',calls_made:5,
 under_calls:2,over_calls:1,exact_calls:1,unclassified_calls:1,
 under_pct:'40.0',over_pct:'20.0',exact_pct:'20.0',
 avg_deviation:'0.5',avg_abs_deviation:'1.25',deviation_observations:4,
 avg_points_per_hand:'0.35'
};
const [p]=normalizeMeldingStatistics([row]);
assert.equal(p.underPct,40);assert.equal(p.overPct,20);assert.equal(p.exactPct,20);
assert.equal(p.unknown,1);assert.equal(p.avgDeviation,0.5);
assert.equal(METRICS.length,7);
assert.equal(displayMetric(METRICS[1],p),'40,0 %');
assert.equal(displayMetric(METRICS[4],p),'0,50');
assert.equal(displayMetric(METRICS[6],p),'0,35');
assert.match(metricDetail(METRICS[1],p),/2 af 5/);
assert.equal(displayMetric(METRICS[1],normalizeMeldingStatistics([{...row,calls_made:0,under_calls:0,over_calls:0,exact_calls:0,unclassified_calls:0,under_pct:null,over_pct:null,exact_pct:null,avg_deviation:null,avg_abs_deviation:null,deviation_observations:0}])[0]),'—');
assert.throws(()=>normalizeMeldingStatistics([{...row,under_calls:3}]),/ufuldstændige/);
const winners=normalizeMeldingStatistics([row,{...row,player_id:'another',player_name:'David',net_points:'7.9'}]);
assert.equal(winners[0].name,'David');
console.log('PASS model: metrics, zero calls, unknown solo, format, errors, order');
