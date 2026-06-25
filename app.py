from flask import Flask, request, jsonify, send_file
import json
import os
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
app.config['UPLOAD_FOLDER'] = 'static/images'
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

os.makedirs('data', exist_ok=True)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

DISHES_FILE = 'data/dishes.json'
ORDERS_FILE = 'data/orders.json'

def init_data():
    if not os.path.exists(DISHES_FILE):
        with open(DISHES_FILE, 'w', encoding='utf-8') as f:
            json.dump({"dishes": []}, f, ensure_ascii=False)
    if not os.path.exists(ORDERS_FILE):
        with open(ORDERS_FILE, 'w', encoding='utf-8') as f:
            json.dump({"orders": []}, f, ensure_ascii=False)

def read_data(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def write_data(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        return f.read()

# ------------------- 菜品 API -------------------
@app.route('/api/dishes', methods=['GET'])
def get_dishes():
    data = read_data(DISHES_FILE)
    return jsonify(data)

@app.route('/api/dishes', methods=['POST'])
def add_dish():
    data = read_data(DISHES_FILE)
    dish_name = request.form.get('dish_name')
    price = float(request.form.get('price'))
    category = request.form.get('category', '荤菜')
    image_path = 'static/images/default.jpg'
    if 'image' in request.files:
        file = request.files['image']
        if file and allowed_file(file.filename):
            filename = secure_filename(f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}")
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            image_path = f"static/images/{filename}"
    new_dish = {
        "dish_id": len(data["dishes"]) + 1,
        "dish_name": dish_name,
        "price": price,
        "category": category,
        "image_path": image_path,
        "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "last_modify_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    data["dishes"].append(new_dish)
    write_data(DISHES_FILE, data)
    return jsonify({"dish_id": new_dish["dish_id"]})

@app.route('/api/dishes/<int:dish_id>', methods=['PUT'])
def update_dish_price(dish_id):
    data = read_data(DISHES_FILE)
    for dish in data["dishes"]:
        if dish["dish_id"] == dish_id:
            dish["price"] = float(request.json.get('price'))
            dish["last_modify_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            write_data(DISHES_FILE, data)
            return jsonify({"success": True})
    return jsonify({"error": "菜品不存在"}), 404

# ------------------- 订单 API -------------------
@app.route('/api/orders', methods=['GET'])
def get_orders():
    data = read_data(ORDERS_FILE)
    table_id = request.args.get('table_id')
    if table_id:
        orders = [o for o in data["orders"] if o["table_id"] == int(table_id)]
        return jsonify({"orders": orders})
    return jsonify(data)

@app.route('/api/orders', methods=['POST'])
def create_order():
    try:
        data = read_data(ORDERS_FILE)
        items = request.json.get('items')
        if not items:
            return jsonify({"error": "菜品列表为空"}), 400

        # 补全每个 item 的字段，确保 image_path 不为空
        for item in items:
            if 'item_id' not in item:
                item['item_id'] = int(datetime.now().timestamp() * 1000)
            if 'image_path' not in item or not item['image_path']:
                item['image_path'] = 'static/images/default.jpg'
            item['price'] = float(item['price'])
            item['quantity'] = int(item['quantity'])
            if 'status' not in item:
                item['status'] = '待做'

        new_order = {
            "order_id": datetime.now().strftime("%Y%m%d%H%M%S"),
            "table_id": request.json.get('table_id'),
            "status": "未结账",
            "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "items": items,
            "total_amount": 0,
            "actual_payment": 0,
            "payment_time": "",
            "invoice_info": ""
        }
        total = sum(item["price"] * item["quantity"] for item in items)
        new_order["total_amount"] = total
        data["orders"].append(new_order)
        write_data(ORDERS_FILE, data)
        return jsonify({"order_id": new_order["order_id"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/<order_id>', methods=['PUT'])
def update_order(order_id):
    data = read_data(ORDERS_FILE)
    for order in data["orders"]:
        if order["order_id"] == order_id:
            if 'items' in request.json:
                order["items"] = request.json.get('items')
                total = sum(item["price"] * item["quantity"] for item in order["items"])
                order["total_amount"] = total
            if 'status' in request.json:
                order["status"] = request.json.get('status')
            write_data(ORDERS_FILE, data)
            return jsonify({"success": True})
    return jsonify({"error": "订单不存在"}), 404

@app.route('/api/orders/<order_id>', methods=['DELETE'])
def delete_order(order_id):
    data = read_data(ORDERS_FILE)
    data["orders"] = [o for o in data["orders"] if o["order_id"] != order_id]
    write_data(ORDERS_FILE, data)
    return jsonify({"success": True})

@app.route('/api/orders/<order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    data = read_data(ORDERS_FILE)
    for order in data["orders"]:
        if order["order_id"] == order_id:
            order["status"] = request.json.get('status')
            write_data(ORDERS_FILE, data)
            return jsonify({"success": True})
    return jsonify({"error": "订单不存在"}), 404

@app.route('/api/orders/<order_id>/items/<int:item_id>/status', methods=['PUT'])
def update_item_status(order_id, item_id):
    data = read_data(ORDERS_FILE)
    for order in data["orders"]:
        if order["order_id"] == order_id:
            for item in order["items"]:
                if item.get("item_id") == item_id:
                    item["status"] = request.json.get('status')
                    write_data(ORDERS_FILE, data)
                    return jsonify({"success": True})
    return jsonify({"error": "菜品不存在"}), 404

@app.route('/api/orders/<order_id>/checkout', methods=['POST'])
def checkout_order(order_id):
    data = read_data(ORDERS_FILE)
    for order in data["orders"]:
        if order["order_id"] == order_id:
            order["status"] = "已结账"
            order["actual_payment"] = float(request.json.get('actual_payment'))
            order["payment_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            order["invoice_info"] = request.json.get('invoice_info', "")
            write_data(ORDERS_FILE, data)
            return jsonify({"success": True})
    return jsonify({"error": "订单不存在"}), 404

@app.route('/api/export', methods=['GET'])
def export_orders():
    data = read_data(ORDERS_FILE)
    date = request.args.get('date', datetime.now().strftime("%Y-%m-%d"))
    content = f"订单导出 - {date}\n" + "="*50 + "\n"
    for order in data["orders"]:
        if date in order["create_time"] and order["status"] == "已结账":
            content += f"\n桌号: {order['table_id']}\n订单ID: {order['order_id']}\n时间: {order['create_time']}\n菜品明细:\n"
            for item in order["items"]:
                content += f"  - {item['dish_name']} x{item['quantity']} = ¥{item['price']*item['quantity']:.2f}\n"
            content += f"总计: ¥{order['total_amount']:.2f}\n实收: ¥{order['actual_payment']:.2f}\n"
            if order["invoice_info"]:
                content += f"发票: {order['invoice_info']}\n"
    filename = f"orders_{date}.txt"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    return send_file(filename, as_attachment=True)

if __name__ == '__main__':
    init_data()
    app.run(host='0.0.0.0', port=5000, debug=True)