// Independent presentation module; existing Stilling / Synergi renderers untouched.
// Uses the pinned Chart.js UMD bundle loaded by statistik.html.
const palette = ['#e7ba61','#71cdb0','#84b4f5','#ea9291','#ba9bf1','#f4bbd6',
  '#81d9e4','#d9c37b','#97d08e','#c799e2','#c3b5a5','#d8e19a'];

export function drawScoreHistory({canvas,legend,model}) {
  if (!globalThis.Chart) throw new Error('Diagram-biblioteket kunne ikke indlæses');
  const format = n => Number(n).toLocaleString('da-DK',{
    minimumFractionDigits:2,maximumFractionDigits:2
  });
  const colorOf = i => palette[i%palette.length];
  const datasets = model.players.map((p,i)=>({
    label:p.name,
    data:p.series.map((y,x)=>({x,y})),
    borderColor:colorOf(i),
    backgroundColor:colorOf(i),
    borderWidth:2.3,
    pointRadius:0,
    pointHitRadius:9,
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
      interaction:{mode:'index',intersect:false},
      layout:{padding:{top:9,right:10,bottom:1,left:0}},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(11,22,34,.95)',
          borderWidth:1,borderColor:'#476078',
          titleColor:'#f3f8fd',bodyColor:'#ecf2f8',
          padding:11,
          callbacks:{
            title:items=>items.length?`Spil ${items[0].parsed.x}`:'',
            label:item=>`${item.dataset.label}: ${format(item.parsed.y)} point`
          }
        }
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
    const name=document.createElement('span');name.textContent=player.name;
    button.append(marker,name);
    button.addEventListener('click',()=>{
      const next=!chart.isDatasetVisible(i);
      chart.setDatasetVisibility(i,next);
      button.setAttribute('aria-pressed',String(next));
      chart.update('none');
    });
    legend.append(button);
  });
  return chart;
}
