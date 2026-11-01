// Approximate visible geometry digitized from IMG_1784, not the original draft.
// The route grazes the lower edge of alternating tires; the cropped continuation
// is deliberately not inferred.
export function tightTireSlalom(){
const pixels=[[203,665],[218,683],[215,730],[219,749],[247,759],[263,789],[275,827],[276,861],[270,882],[254,899],[237,904],[204,903],[177,896],[154,884],[143,883],[128,895],[114,914],[106,934],[107,945],[126,950],[163,950],[205,950],[227,951],[241,962],[260,984],[269,1004],[267,1024],[251,1043],[226,1055],[204,1058],[178,1049],[158,1041],[147,1048],[133,1068],[117,1088],[111,1105],[120,1115],[148,1116],[184,1112],[216,1111],[237,1120],[250,1140],[250,1160],[244,1177],[232,1187],[211,1189],[193,1185],[180,1172],[166,1157],[153,1158],[139,1172],[124,1193]];
const points=pixels.map(([x,y])=>({x:(x-30)/1.347,y:(y-215)/1.347}));const tires=[[219,858],[143,935],[219,1010],[143,1087],[219,1164]].map(([x,y],i)=>({id:'t'+i,type:'tire',x:(x-30)/1.347,y:(y-215)/1.347}));
return [{id:'tight-slalom',type:'curve',routeStyle:'planned',...points[0],points,color:'#111827',motion:'forward'},...tires];
}
