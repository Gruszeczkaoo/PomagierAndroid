package pl.bydon.castlebot

import android.graphics.Bitmap
import android.graphics.Color
import java.util.ArrayDeque
import kotlin.math.abs

/**
 * First-pass detection of the white downward selection arrow above a
 * friendly unit. Does not use ML or know actual game coordinates.
 */
object BattleVision {
    fun findSelectedUnit(b: Bitmap): Pair<Float,Float>? {
        val w=b.width
        val h=b.height
        if (w<=h || w<500 || h<250) return null
        val step=3
        val left=(w*.18f).toInt()
        val top=(h*.31f).toInt()
        val right=(w*.67f).toInt()
        val bottom=(h*.75f).toInt()
        val nx=((right-left)/step).coerceAtLeast(1)
        val ny=((bottom-top)/step).coerceAtLeast(1)
        val mask=BooleanArray(nx*ny)
        val seen=BooleanArray(nx*ny)
        for (j in 0 until ny) for (i in 0 until nx) {
            val c=b.getPixel(left+i*step,top+j*step)
            val r=Color.red(c)
            val g=Color.green(c)
            val blue=Color.blue(c)
            mask[j*nx+i]=r>240 && g>239 && blue>232 &&
                abs(r-g)<17 && abs(g-blue)<23
        }
        var best = -1.0
        var bestPoint: Pair<Float,Float>?=null
        val queue=ArrayDeque<Int>()
        for (start in mask.indices) {
            if(!mask[start] || seen[start])continue
            seen[start]=true
            queue.clear()
            queue.add(start)
            var n=0
            var minX=Int.MAX_VALUE
            var maxX=-1
            var minY=Int.MAX_VALUE
            var maxY=-1
            while(queue.isNotEmpty() && n<1000) {
                val k=queue.removeFirst()
                val x=k%nx
                val y=k/nx
                n++
                minX=minOf(minX,x);maxX=maxOf(maxX,x)
                minY=minOf(minY,y);maxY=maxOf(maxY,y)
                fun add(p:Int) {
                    if(p>=0 && p<mask.size && mask[p] && !seen[p]){
                        seen[p]=true;queue.addLast(p)
                    }
                }
                if(x>0)add(k-1)
                if(x+1<nx)add(k+1)
                if(y>0)add(k-nx)
                if(y+1<ny)add(k+nx)
            }
            if(n<9 || n>190)continue
            val widthPx=(maxX-minX+1)*step
            val heightPx=(maxY-minY+1)*step
            if(widthPx !in 12..66 || heightPx !in 15..64)continue
            val cx=left+(minX+maxX)*step/2
            val cy=top+(minY+maxY)*step/2
            if(cy<(h*.35f).toInt() || cy>(h*.71f).toInt())continue
            if(heightPx*2<widthPx)continue
            val score=100.0-
                abs(cx/w.toDouble()-.425)*85.0-
                abs(cy/h.toDouble()-.49)*55.0+
                n.toDouble()*.055
            if(score>best) {
                best=score
                bestPoint=Pair(cx/w.toFloat(),
                    ((top+maxY*step+h*.075f)/h).coerceIn(0f,1f))
            }
        }
        return if(best>73)bestPoint else null
    }
}
