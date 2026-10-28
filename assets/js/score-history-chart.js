// Independent presentation module; existing Stilling / Synergi renderers untouched.
// Uses the pinned Chart.js UMD bundle loaded by statistik.html.
import {createChartPopover} from './chart-popover.js?v=1.0.7';
const palette = ['#e7ba61','#71cdb0','#84b4f5','#ea9291','#ba9bf1','#f4bbd6',
  '#81d9e4','#d9c37b','#97d08e','#c799e2','#c3b5a5','#d8e19a'];

export function drawScoreHistory({canvas,legend,model,avatar}) {
  if (!globalThis.Chart) throw new Error('Diagram-biblioteket kunne ikke indlæses');
  const format = n => Number(n).toLocaleString('da-DK',{
    minimumFractionDigits:2,maximumFractionDigits:2
  });
  const colorOf = i => palette[i%palette.length];
  const popover = createChartPopover(canvas.parentElement);
  const datasets = model.players.map((p,i)=>({
    label:p.name,
    data:p.series.map((y,x)=>({x,y})),
    borderColor:colorOf(i),
    backgroundColor:colorOf(i),
    borderWidth:2.3,
    pointRadius:0,
    pointHitRadius:13,
    pointHoverRadius:4,
    pointHoverBorderWidth:2,
    tension:0,
    fill:false,
    spanGaps:false
  }));
  const chart = new globalThis.Chart(canvas.getContext('2d'),{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      normalized:true,
      parsing:false,
      interaction:{mode:'nearest',intersect:false},
      onClick:(event,unused,chartInstance) => {
        const xScale = chartInstance.scales.x;
        const clicked = xScale.getValueForPixel(event.x);
        if (!Number.isFinite(clicked) || clicked < -0.5 || clicked > model.gameCount + 0.5) {
          popover.hide();
          return;
        }
        // Any position along the x-axis chooses the nearest completed game.
        // All players' accumulated totals are shown, not only the selected line.
        const game = Math.min(model.gameCount, Math.max(0, Math.round(clicked)));
        const details = model.players.map(player => ({
          name: player.name,
          value: `${format(player.series[game])} point`
        }));
        const bounds = canvas.getBoundingClientRect();
        const x = bounds.left + event.x * (bounds.width / chartInstance.width);
        const y = bounds.top + event.y * (bounds.height / chartInstance.height);
        popover.show({getBoundingClientRect:()=>({left:x,top:y,width:0,height:0})},
          `Efter ${game} spil`, details, `game:${game}`);
      },
      layout:{padding:{top:9,right:10,bottom:1,left:0}},
      plugins:{
        legend:{display:false},
        tooltip:{enabled:false}
      },
      scales:{
        x:{type:'linear',min:0,max:Math.max(1,model.gameCount),
          grid:{color:'rgba(116,150,174,.14)'},
          border:{color:'#51677c'},
          ticks:{color:'#a2b4c4',precision:0,maxTicksLimit:9,autoSkip:true,
            callback:value=>Number.isInteger(value)?String(value):''},
          title:{display:true,text:'Spil nr.',color:'#a2b4c4',font:{size:11,weight:'normal'}}
        },
        y:{grid:{color:context=>Number(context.tick?.value)===0?'#71899d':'rgba(116,150,174,.14)',
                 lineWidth:context=>Number(context.tick?.value)===0?1.4:1},
          border:{color:'#51677c'},
          ticks:{color:'#a2b4c4',maxTicksLimit:7,callback:value=>format(value)},
          title:{display:false}
        }
      }
    }
  });
  legend.replaceChildren();
  model.players.forEach((player,i)=>{
    const button=document.createElement('button');
    button.type='button';button.className='score-history-player';
    button.setAttribute('aria-pressed','true');
    button.setAttribute('aria-label',`Vis eller skjul ${player.name}`);
    const marker=document.createElement('span');
    marker.className='score-history-marker';marker.style.backgroundColor=colorOf(i);
    button.title = player.name;
    if (typeof avatar === 'function') button.append(marker, avatar(player));
    else { const name=document.createElement('span');name.textContent=player.name;button.append(marker,name); }
    button.addEventListener('click',()=>{
      const next=!chart.isDatasetVisible(i);
      chart.setDatasetVisibility(i,next);
      button.setAttribute('aria-pressed',String(next));
      chart.update('none');
    });
    legend.append(button);
  });
  // The Alle control lives after the player buttons, inside the same legend.
  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'score-history-select-all';
  allButton.textContent = 'Alle';
  allButton.setAttribute('aria-label', 'Vælg eller fravælg alle spillere');
  const updateAllState = () => {
    const selected = model.players.every((_, i) => chart.isDatasetVisible(i));
    allButton.setAttribute('aria-pressed', String(selected));
    allButton.title = selected ? 'Fravælg alle spillere' : 'Vælg alle spillere';
  };
  allButton.addEventListener('click', () => {
    const allSelected = model.players.every((_, i) => chart.isDatasetVisible(i));
    model.players.forEach((_, i) => chart.setDatasetVisibility(i, !allSelected));
    for (const button of legend.querySelectorAll('.score-history-player')) {
      button.setAttribute('aria-pressed', String(!allSelected));
    }
    updateAllState();
    chart.update('none');
  });
  legend.append(allButton);
  for (const playerButton of legend.querySelectorAll('.score-history-player')) {
    playerButton.addEventListener('click', updateAllState);
  }
  updateAllState();
  const chartDestroy = chart.destroy.bind(chart);
  chart.destroy = () => { popover.destroy();chartDestroy(); };
  chart.hideDetail = () => popover.hide();
  return chart;
}
