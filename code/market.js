var market = {

    run :function(){
        var terminal = Game.rooms['W58N12'].terminal
        if(terminal.cooldown<1){
            // var orders = Game.market.getAllOrders(order => order.resourceType == RESOURCE_ENERGY &&
            //     order.type == ORDER_BUY && order.price >= 12);

        var orders = Game.market.getAllOrders(order => order.resourceType == RESOURCE_ENERGY &&
            order.type == ORDER_SELL && order.price < 3 );

            // Game.market.deal(order.id, order.amount, "W58N12");
            for (const order of orders) {
                
                var a =Game.market.deal(order.id, order.amount, "W58N12")
                console.log(a)
                //Game.market.deal(order.id, order.amount, "W57N13")
            }

        }
    },
    terminal : function(){
        if(Game.rooms['W54N8'].terminal.store.getFreeCapacity() > 200000){
            Game.rooms['W55N13'].terminal.send(RESOURCE_ENERGY, 50000, 'W54N8');
            Game.rooms['W57N13'].terminal.send(RESOURCE_ENERGY, 50000, 'W54N8');
            Game.rooms['W58N12'].terminal.send(RESOURCE_ENERGY, 50000, 'W54N8');
            
        }
        
        
    }
};


module.exports = market;