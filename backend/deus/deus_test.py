import urllib.request
import sys
import multiprocess as mp

deus_server=sys.argv[1]

def run_test():
	#print("thread run_test: ", mp.current_process().name)
	contents = urllib.request.urlopen("http://"+deus_server)
	if contents.status != 200:
		print("Err...")

if __name__ == "__main__":
	for i in range(100):
		p = mp.Process(target=run_test)
		p.start()
	print("test terminated!")
