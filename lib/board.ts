export function screenPoint(square:string,blackBottom:boolean){const f='abcdefgh'.indexOf(square[0]),r=Number(square[1])-1;return {x:blackBottom?7-f:f,y:blackBottom?r:7-r};}
export function squareAt(x:number,y:number,blackBottom:boolean){if(x<0||y<0||x>=8||y>=8)return '';const f=Math.floor(x),r=Math.floor(y);return 'abcdefgh'[blackBottom?7-f:f]+(blackBottom?r+1:8-r);}
