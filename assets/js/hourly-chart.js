// One Chart.js line chart with hourly observations and each player's own
// correctly weighted average (dashed). The player legend is stable when the
// statistic changes; switching never redraws the profile photographs.
import {metricObservation, hourLabel, formatHourlyValue} from './hourly-model.js';

const palette = ['#e7ba61','#71cdb0','#84b4f5','#ea9291','#ba9bf1','#f4bbd6',
  '#81d9e4','#d9c37b','#97d08e','#c799e2','#c3b5a5','#d8e19a'];

export function createHourlyChart({canvas, legend, model, metric='points', avatar}) {
  if (!globalThis.Chart) throw new Error('Diagram-biblioteket kunne ikke indlæses');
  if (!model.hours.length) throw new Error('Ingen tidsstemplede spil at vise');
  const colors = model.players.map((_,index)=>palette[index % palette.length]);
  const datasets = model.players.flatMap((item,index)=>{
    const color=colors[index];
    return [
      {label:item.player.name, data:[], borderColor:color, backgroundColor:color,
       borderWidth:2.4, pointRadius:2.2, pointHoverRadius:5, pointHitRadius:10,
       tension:.14, spanGaps:false, fill:false, clockPlayer:index, clockAverage:false},
      {label:`${item.player.name} · gennemsnit`, data:[], borderColor:color,
       backgroundColor:color, borderWidth:1.5, borderDash:[6,5],
       pointRadius:0, pointHitRadius:0, tension:0, spanGaps:false, fill:false,
       clockPlayer:index, clockAverage:true}
    ];
  });
  let activeMetric=metric;
  const chart=new globalThis.Chart(canvas.getContext('2d'),{
    type:'line', data:{labels:model.hours.map(hourLabel),datasets},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
      interaction:{mode:'index',intersect:false},
      layout:{padding:{top:9,right:10,bottom:2,left:1}},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(11,22,34,.96)',borderColor:'#476078',borderWidth:1,
          titleColor:'#f3f8fd',bodyColor:'#ecf2f8',padding:11,
          filter:entry=>!entry.dataset.clockAverage && entry.parsed.y!=null,
          callbacks:{
            title:entries=>entries.length?`Kl. ${hourLabel(model.hours[entries[0].dataIndex])}`:'',
            label:entry=>{
              const person=model.players[entry.dataset.clockPlayer];
              const counts=person.byHour.get(model.hours[entry.dataIndex]);
              const obs=metricObservation(counts,activeMetric);
              const unit=['absolute','exact'].includes(activeMetric) ? 'meldinger' : 'spil';
              return `${person.player.name}: ${formatHourlyValue(obs.value,activeMetric)} (${obs.samples} ${unit})`;
            },
            afterLabel:entry=>{
              const person=model.players[entry.dataset.clockPlayer];
              const avg=metricObservation(person.total,activeMetric);
              return `Eget gennemsnit: ${formatHourlyValue(avg.value,activeMetric)}`;
            }
          }
        }
      },
      scales:{
        x:{grid:{color:'rgba(116,150,174,.12)'},border:{color:'#51677c'},
          ticks:{color:'#a2b4c4',maxTicksLimit:10,autoSkip:true,maxRotation:0},
          title:{display:false}},
        y:{grid:{color:ctx=>Number(ctx.tick?.value)===0?'#71899d':'rgba(116,150,174,.14)',
                 lineWidth:ctx=>Number(ctx.tick?.value)===0?1.4:1},
          border:{color:'#51677c'},
          ticks:{color:'#a2b4c4',maxTicksLimit:7,
            callback:value=>`${Number(value).toLocaleString('da-DK',{maximumFractionDigits:2})}${['calls','exact','solo'].includes(activeMetric)?' %':''}`}}
      }
    }
  });
  function setMetric(nextMetric) {
    activeMetric=nextMetric;
    model.players.forEach((item,index)=>{
      chart.data.datasets[index*2].data=model.hours.map((hour,x)=>({x,y:metricObservation(item.byHour.get(hour),nextMetric).value}));
      const avg=metricObservation(item.total,nextMetric).value;
      chart.data.datasets[index*2+1].data=model.hours.map((hour,x)=>({x,y:avg}));
    });
    chart.update('none');
  }
  legend.replaceChildren();
  model.players.forEach((item,index)=>{
    const button=document.createElement('button');button.type='button';
    button.className='score-history-player hourly-player';
    button.setAttribute('aria-pressed','true');
    button.setAttribute('aria-label',`Vis eller skjul ${item.player.name}`);
    const marker=document.createElement('span');marker.className='score-history-marker';
    marker.style.backgroundColor=colors[index];
    const picture=avatar(item.player,'hourly-avatar');
    const name=document.createElement('span');name.textContent=item.player.name;
    button.append(marker,picture,name);
    button.addEventListener('click',()=>{
      const visible=!chart.isDatasetVisible(index*2);
      chart.setDatasetVisibility(index*2,visible);
      chart.setDatasetVisibility(index*2+1,visible);
      button.setAttribute('aria-pressed',String(visible));
      chart.update('none');
    });
    legend.append(button);
  });
  setMetric(metric);
  return {chart,setMetric,destroy:()=>chart.destroy()};
}
