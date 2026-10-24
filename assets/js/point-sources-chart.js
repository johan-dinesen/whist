// Horizontal diverging stacked bars. Positive net contributions extend right
// of zero, negative ones extend left, and four role totals sum to Stilling.
import {POINT_SOURCE_ROLES} from './point-sources-model.js';

const format = n => Number(n).toLocaleString('da-DK', {minimumFractionDigits:2,maximumFractionDigits:2});
export function drawPointSources({canvas, players}) {
  if (!globalThis.Chart) throw new Error('Diagram-biblioteket kunne ikke indlæses');
  const datasets = POINT_SOURCE_ROLES.map(role => ({
    label:role.label,
    data: players.map(p => p.roles[role.key].points),
    backgroundColor:role.color,
    borderColor:role.color,
    borderWidth:0,
    borderSkipped:false,
    borderRadius:3,
    barThickness:20,
    stack:'sources',
    roleKey:role.key
  }));
  return new globalThis.Chart(canvas.getContext('2d'), {
    type:'bar',
    data:{labels:players.map(p => p.name),datasets},
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      layout:{padding:{top:6,right:12,bottom:1,left:2}},
      interaction:{mode:'nearest',intersect:true},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(11,22,34,.95)',
          borderWidth:1,borderColor:'#476078',
          titleColor:'#f3f8fd',bodyColor:'#ecf2f8',
          padding:11,
          callbacks:{
            title:items=>items.length ? players[items[0].dataIndex].name : '',
            label:item=>{
              const player=players[item.dataIndex];
              const role=item.dataset.roleKey;
              const entry=player.roles[role];
              return `${item.dataset.label}: ${entry.points > 0 ? '+' : ''}${format(entry.points)} point · ${entry.games} spil`;
            },
            footer:items=>items.length ? `I alt: ${format(players[items[0].dataIndex].netPoints)} point` : ''
          }
        }
      },
      scales:{
        x:{stacked:true,
          grid:{color:context=>Number(context.tick?.value)===0?'#819bae':'rgba(116,150,174,.13)',
            lineWidth:context=>Number(context.tick?.value)===0?1.6:1},
          border:{color:'#51677c'},
          ticks:{color:'#a2b4c4',maxTicksLimit:8,callback:v=>format(v)},
          title:{display:true,text:'Nettopoint efter rolle',color:'#a2b4c4',font:{size:11}}
        },
        y:{stacked:true,grid:{display:false},border:{display:false},
          ticks:{color:'#e8f1f8',font:{size:12,weight:650},autoSkip:false}
        }
      }
    }
  });
}
